from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.deps import get_current_user
from gigsnano_api.auth.models import User
from gigsnano_api.core.db import get_db
from gigsnano_api.email.deps import get_email_provider
from gigsnano_api.email.messages import invite_email
from gigsnano_api.email.provider import EmailProvider
from gigsnano_api.features.invitations import service
from gigsnano_api.features.members.schemas import (
    InvitationOut,
    InviteBatchOut,
    InviteBatchPayload,
    ProjectGrantIn,
    RecipientResultOut,
)
from gigsnano_api.models import (
    EInvitationStatus,
    EProjectRole,
    EWorkspaceRole,
    Project,
    Workspace,
    WorkspaceInvitation,
)
from gigsnano_api.shared.context import WorkspaceContext, get_workspace_context, require_role

router = APIRouter(tags=["invitations"])

ADMINS = (EWorkspaceRole.ADMIN, EWorkspaceRole.OWNER)


async def _validated_grants(
    db: AsyncSession, workspace_id: str, grants: list[ProjectGrantIn]
) -> list[dict]:
    """Check the project access an invitation is about to promise (GIN-529).

    Checked here rather than only at redemption because this is the moment an
    authority exists to check against: the caller is a workspace admin/owner
    right now, and by the time the invite is accepted they may be neither. The
    workspace filter is the tenant boundary — a `project_id` from another
    workspace must not become a seat there.
    """
    if not grants:
        return []
    if any(g.role is EProjectRole.OWNER for g in grants):
        # Ownership is transferred deliberately to someone who already holds the
        # project, never handed to an address that has not accepted yet.
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Cannot grant project ownership by invitation"
        )

    wanted = {g.project_id for g in grants}
    found = set(
        (
            await db.execute(
                select(Project.id).where(
                    Project.id.in_(wanted), Project.workspace_id == workspace_id
                )
            )
        ).scalars().all()
    )
    if wanted - found:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown project in project_grants")

    # Last one wins if the same project is listed twice — a duplicate is a UI
    # slip, not a reason to fail the whole batch.
    deduped = {g.project_id: g for g in grants}
    return [{"project_id": g.project_id, "role": g.role.value} for g in deduped.values()]


def _out(inv: WorkspaceInvitation, slug: str, invited_by_name: str) -> InvitationOut:
    return InvitationOut(
        id=inv.id,
        workspace_slug=slug,
        email=inv.email,
        role=inv.role,
        invited_by_name=invited_by_name,
        created_at=inv.created_at,
        status=service.effective_status(inv),
        expires_at=inv.expires_at,
        last_sent_at=inv.last_sent_at,
        accepted_at=inv.accepted_at,
        resend_count=inv.resend_count,
        project_grants=inv.project_grants or [],
    )


async def _send_invite(
    provider: EmailProvider,
    workspace: Workspace,
    inviter: User,
    invitation: WorkspaceInvitation,
    raw_token: str,
) -> bool:
    """Deliver one invitation. Returns whether it went out.

    Awaited rather than backgrounded on purpose: the batch response reports a
    per-recipient outcome, and a background task cannot tell the caller that
    recipient 3 bounced. Never raises — a provider error is this recipient's
    result, not the whole batch's.
    """
    subject, html = invite_email(
        workspace_name=workspace.name,
        inviter_name=inviter.display_name,
        role=invitation.role.value,
        link=service.invite_link(raw_token),
        expires_at=invitation.expires_at,
    )
    try:
        await provider.send(invitation.email, subject, html)
    except Exception:  # noqa: BLE001 - delivery is one recipient's outcome
        return False
    return True


@router.get("/workspaces/{workspace_slug}/invitations/", response_model=list[InvitationOut])
async def list_invitations(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            select(WorkspaceInvitation, User.display_name)
            .join(User, User.id == WorkspaceInvitation.invited_by_id)
            .where(WorkspaceInvitation.workspace_id == ctx.workspace.id)
            .order_by(WorkspaceInvitation.created_at.desc())
        )
    ).all()
    return [_out(inv, ctx.workspace.slug, name) for inv, name in rows]


@router.post("/workspaces/{workspace_slug}/invitations/", response_model=InviteBatchOut)
async def invite_batch(
    payload: InviteBatchPayload,
    ctx: WorkspaceContext = Depends(require_role(*ADMINS)),
    db: AsyncSession = Depends(get_db),
    provider: EmailProvider = Depends(get_email_provider),
):
    """Invite many recipients at once, reporting each one's outcome.

    Returns 200 with per-recipient results rather than a 4xx on partial failure:
    a single error status for the whole request would hide the invitations that
    did go out, and the operator would have no safe way to retry.
    """
    if payload.role is EWorkspaceRole.OWNER:
        # Ownership is established at workspace creation and transferred
        # deliberately; an invitation must never mint a second owner.
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot invite someone as owner")
    if len(payload.emails) > service.MAX_BATCH:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"At most {service.MAX_BATCH} recipients per batch",
        )

    grants = await _validated_grants(db, ctx.workspace.id, payload.project_grants)

    results: list[service.RecipientResult] = []
    pending_sends: list[tuple[WorkspaceInvitation, str, int]] = []
    seen: set[str] = set()

    for raw_email in payload.emails:
        normalized = service.normalize_email(raw_email)
        if normalized in seen:
            continue  # the same address twice in one paste is one recipient
        seen.add(normalized)

        result, invitation, raw_token = await service.prepare_recipient(
            db, ctx.workspace, ctx.user, raw_email, payload.role, grants
        )
        if invitation is not None:
            pending_sends.append((invitation, raw_token, len(results)))
        results.append(result)

    # Persist before sending: an invitation the recipient can act on must exist
    # in the database first. A send that then fails is recorded below.
    await db.commit()

    for invitation, raw_token, index in pending_sends:
        if not await _send_invite(provider, ctx.workspace, ctx.user, invitation, raw_token):
            invitation.status = EInvitationStatus.DELIVERY_FAILED
            results[index] = service.RecipientResult(
                email=invitation.email,
                outcome="failed",
                detail="We couldn't deliver the invitation email.",
                invitation_id=invitation.id,
                # The link still works — surfacing it lets the operator share it
                # another way instead of being stuck behind a bad mail route.
                invite_url=service.invite_link(raw_token),
            )
    await db.commit()

    return InviteBatchOut(results=[RecipientResultOut(**vars(r)) for r in results])


@router.post(
    "/workspaces/{workspace_slug}/invitations/{invitation_id}/resend/",
    response_model=RecipientResultOut,
)
async def resend_invitation(
    invitation_id: str,
    ctx: WorkspaceContext = Depends(require_role(*ADMINS)),
    db: AsyncSession = Depends(get_db),
    provider: EmailProvider = Depends(get_email_provider),
):
    """Re-issue an invitation. Rotates the token, so any previously shared link
    stops working — that is the point, not a side effect."""
    invitation = await _invitation_or_404(db, ctx, invitation_id)
    if service.effective_status(invitation) is EInvitationStatus.ACCEPTED:
        raise HTTPException(status.HTTP_409_CONFLICT, "That invitation was already accepted")

    raw_token = service.issue_token(invitation)
    invitation.status = EInvitationStatus.PENDING  # revives revoked/expired/failed
    invitation.resend_count += 1
    await db.commit()

    sent = await _send_invite(provider, ctx.workspace, ctx.user, invitation, raw_token)
    if not sent:
        invitation.status = EInvitationStatus.DELIVERY_FAILED
    await db.commit()

    return RecipientResultOut(
        email=invitation.email,
        outcome="resent" if sent else "failed",
        detail="Invitation resent" if sent else "We couldn't deliver the invitation email.",
        invitation_id=invitation.id,
        invite_url=service.invite_link(raw_token),
    )


async def _invitation_or_404(
    db: AsyncSession, ctx: WorkspaceContext, invitation_id: str
) -> WorkspaceInvitation:
    invitation = (
        await db.execute(
            select(WorkspaceInvitation).where(
                WorkspaceInvitation.id == invitation_id,
                WorkspaceInvitation.workspace_id == ctx.workspace.id,
            )
        )
    ).scalar_one_or_none()
    if invitation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invitation not found")
    return invitation


@router.delete(
    "/workspaces/{workspace_slug}/invitations/{invitation_id}/",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def revoke_invitation(
    invitation_id: str,
    ctx: WorkspaceContext = Depends(require_role(*ADMINS)),
    db: AsyncSession = Depends(get_db),
):
    """Revoke by transition, not by delete: the Invitations screen shows history,
    and 'who invited this person and what happened' is the audit question."""
    invitation = await _invitation_or_404(db, ctx, invitation_id)
    invitation.status = EInvitationStatus.REVOKED
    await db.commit()


@router.post("/auth/invitations/{token}/accept/")
async def accept_invitation(
    token: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    invitation = (
        await db.execute(
            select(WorkspaceInvitation).where(
                WorkspaceInvitation.token_hash == service.hash_token(token)
            )
        )
    ).scalar_one_or_none()
    if invitation is None:
        # Covers an unknown token and a rotated one alike — an attacker learns
        # nothing about whether the invitation ever existed.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invalid or expired invitation")

    raise_redeem_block(service.redeem_block(invitation, user))

    workspace = await service.redeem(db, invitation, user)
    if workspace is None:
        raise HTTPException(status.HTTP_410_GONE, "That workspace no longer exists")
    await db.commit()
    return {"workspace_slug": workspace.slug}


def raise_redeem_block(block: service.RedeemBlock | None) -> None:
    """Map a redemption block to its status code. Shared so the token accept and
    the signed-in accept cannot answer the same refusal two different ways."""
    if block is None:
        return
    if block is service.RedeemBlock.WRONG_EMAIL:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "This invitation was sent to a different email. Sign in with that "
            "account to accept it.",
        )
    if block is service.RedeemBlock.EXPIRED:
        raise HTTPException(
            status.HTTP_410_GONE, "This invitation has expired. Ask for a new one."
        )
    raise HTTPException(status.HTTP_409_CONFLICT, "This invitation is no longer valid.")


@router.post("/auth/me/pending-invites/{invitation_id}/accept/")
async def accept_my_invitation(
    invitation_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Accept an invitation addressed to this account, without the emailed token.

    The invitee who signed up somewhere other than the invite link has an
    account, no membership, and no token in hand — before this they were shown
    the create-workspace wizard for a workspace that already existed.

    Requires a **verified** email. The token proves control of the mailbox; here
    nothing else does, and sign-up does not verify, so without this check anyone
    who registers a known-invited address walks into the workspace.
    """
    invitation = await db.get(WorkspaceInvitation, invitation_id)
    if invitation is None or invitation.email != user.email.lower():
        # One answer for "no such invitation" and "not yours": the caller learns
        # nothing about invitations addressed to anyone else.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invitation not found")
    if not user.email_verified:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Verify your email address to join this workspace, or open the "
            "invitation link we emailed you.",
        )

    raise_redeem_block(service.redeem_block(invitation, user))

    workspace = await service.redeem(db, invitation, user)
    if workspace is None:
        raise HTTPException(status.HTTP_410_GONE, "That workspace no longer exists")
    await db.commit()
    return {"workspace_slug": workspace.slug}
