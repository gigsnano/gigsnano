from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from gigsnano_api.auth.deps import get_current_user
from gigsnano_api.auth.models import User
from gigsnano_api.core.db import get_db
from gigsnano_api.email.deps import get_email_provider
from gigsnano_api.email.messages import invite_email
from gigsnano_api.email.provider import EmailProvider
from gigsnano_api.email.send import send_email_in_background
from gigsnano_api.features.invitations import service as invitations_service
from gigsnano_api.features.members.schemas import (
    AddMemberPayload,
    UpdateMemberPayload,
    WorkspaceMemberOut,
)
from gigsnano_api.features.notifications.router import resolve_and_notify
from gigsnano_api.models import (
    EInvitationStatus,
    EMemberStatus,
    ENotificationKind,
    EWorkspaceRole,
    Workspace,
    WorkspaceInvitation,
    WorkspaceMember,
)
from gigsnano_api.shared.context import (
    WorkspaceContext,
    get_workspace_context,
    get_workspace_context_incl_pending,
    require_role,
)

router = APIRouter(tags=["members"])

ADMINS = (EWorkspaceRole.ADMIN, EWorkspaceRole.OWNER)


def member_out(m: WorkspaceMember, slug: str) -> WorkspaceMemberOut:
    return WorkspaceMemberOut(
        id=m.id,
        workspace_slug=slug,
        user_id=m.user_id,
        display_name=m.user.display_name,
        email=m.user.email,
        avatar_url=m.user.avatar_url,
        role=m.role,
        status=m.status,
        created_at=m.created_at,
    )


def invitation_out(inv: WorkspaceInvitation, slug: str) -> WorkspaceMemberOut:
    """Email invite with no user yet, shaped like IWorkspaceMember for the members list."""
    return WorkspaceMemberOut(
        id=inv.id,
        workspace_slug=slug,
        user_id="",
        display_name=inv.email,
        email=inv.email,
        avatar_url=None,
        role=inv.role,
        status=EMemberStatus.PENDING,
        created_at=inv.created_at,
    )


async def _get_member(db: AsyncSession, workspace_id: str, member_id: str) -> WorkspaceMember | None:
    result = await db.execute(
        select(WorkspaceMember)
        .options(selectinload(WorkspaceMember.user))
        .where(WorkspaceMember.id == member_id, WorkspaceMember.workspace_id == workspace_id)
    )
    return result.scalar_one_or_none()


@router.get("/workspaces/{workspace_slug}/members/", response_model=list[WorkspaceMemberOut])
async def list_members(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    members = (
        await db.execute(
            select(WorkspaceMember)
            .options(selectinload(WorkspaceMember.user))
            .where(WorkspaceMember.workspace_id == ctx.workspace.id)
            .order_by(WorkspaceMember.created_at)
        )
    ).scalars().all()
    invitations = (
        await db.execute(
            select(WorkspaceInvitation)
            .where(
                WorkspaceInvitation.workspace_id == ctx.workspace.id,
                WorkspaceInvitation.status == EInvitationStatus.PENDING,
            )
            .order_by(WorkspaceInvitation.created_at)
        )
    ).scalars().all()
    # Settled rows are retained for the Invitations history screen (GIN-526), so
    # the members list must exclude them — an accepted invitation is already a
    # member row above, and a revoked one is nobody. Expiry is derived rather
    # than stored, hence the second filter in Python.
    live = [
        i
        for i in invitations
        if invitations_service.effective_status(i) is EInvitationStatus.PENDING
    ]
    slug = ctx.workspace.slug
    return [member_out(m, slug) for m in members] + [invitation_out(i, slug) for i in live]


@router.post(
    "/workspaces/{workspace_slug}/members/",
    response_model=WorkspaceMemberOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_member(
    payload: AddMemberPayload,
    background: BackgroundTasks,
    ctx: WorkspaceContext = Depends(require_role(*ADMINS)),
    db: AsyncSession = Depends(get_db),
    provider: EmailProvider = Depends(get_email_provider),
):
    # Exactly one of the two. Bound to locals so the branches below narrow: the
    # XOR alone proves `email` is set in the else-branch, but that is not a shape
    # a type checker can follow.
    picked_user_id, raw_email = payload.user_id, payload.email
    if (picked_user_id is None) == (raw_email is None):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Provide user_id or email")

    # Ownership is established at workspace creation and is un-removable/un-demotable;
    # never let add-member mint a second owner (also blocks pending-admin escalation).
    if payload.role == EWorkspaceRole.OWNER:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot add a member as owner")

    if picked_user_id is not None:
        # Directory pick — user joins immediately.
        user = await db.get(User, picked_user_id)
        if user is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
        new_status = EMemberStatus.ACTIVE
    else:
        email = invitations_service.normalize_email(raw_email or "")
        if invitations_service.is_disposable_email(email):
            # This is the single-invite path; the batch endpoint refuses these
            # too. Both check, or one of them is a bypass around the other.
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "Temporary email addresses aren't allowed",
            )
        user = (
            await db.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()
        if user is None:
            # No account yet — record an invitation row instead of a membership.
            # Token issuance, expiry and the live-invite rule all live in the
            # invitations service so this path and the batch endpoint cannot
            # drift into two different notions of a valid invitation.
            if await invitations_service.live_invitation(db, ctx.workspace.id, email) is not None:
                raise HTTPException(status.HTTP_409_CONFLICT, "Already invited")
            invitation = WorkspaceInvitation(
                workspace_id=ctx.workspace.id,
                email=email,
                role=payload.role,
                invited_by_id=ctx.user.id,
                status=EInvitationStatus.PENDING,
                expires_at=invitations_service.expiry_from_now(),
            )
            raw_token = invitations_service.issue_token(invitation)
            db.add(invitation)
            await db.flush()
            subject, html = invite_email(
                workspace_name=ctx.workspace.name,
                inviter_name=ctx.user.display_name,
                role=payload.role.value,
                link=invitations_service.invite_link(raw_token),
                expires_at=invitation.expires_at,
            )
            background.add_task(
                send_email_in_background, provider, invitation.email, subject, html
            )
            await db.commit()
            return invitation_out(invitation, ctx.workspace.slug)
        new_status = EMemberStatus.PENDING  # existing account must accept

    existing = (
        await db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == ctx.workspace.id,
                WorkspaceMember.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Already a member")

    member = WorkspaceMember(
        workspace_id=ctx.workspace.id, user_id=user.id, role=payload.role, status=new_status
    )
    db.add(member)
    if new_status == EMemberStatus.PENDING and user.id != ctx.user.id:
        await resolve_and_notify(
            db,
            ctx.workspace.id,
            user.id,
            trigger_key="workspace.invite_pending",
            context={
                "actor": ctx.user.display_name,
                "workspace": ctx.workspace.name,
            },
            kind=ENotificationKind.SYSTEM,
            href=f"/{ctx.workspace.slug}",
            triggered_by_id=ctx.user.id,
            require_active_member=False,
        )
    await db.commit()
    member.user = user
    return member_out(member, ctx.workspace.slug)


@router.patch(
    "/workspaces/{workspace_slug}/members/{member_id}/", response_model=WorkspaceMemberOut
)
async def update_member(
    member_id: str,
    payload: UpdateMemberPayload,
    ctx: WorkspaceContext = Depends(get_workspace_context_incl_pending),
    db: AsyncSession = Depends(get_db),
):
    member = await _get_member(db, ctx.workspace.id, member_id)
    if member is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found")

    if payload.accept:
        # Only the invited user can accept their own pending membership.
        if member.user_id != ctx.user.id or member.status != EMemberStatus.PENDING:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Nothing to accept")
        member.status = EMemberStatus.ACTIVE
    elif payload.role is not None:
        # Admin action: the actor must be an ACTIVE admin/owner. A pending invitee
        # (admitted here only so they can accept) must not perform admin writes.
        if ctx.status != EMemberStatus.ACTIVE or ctx.role not in ADMINS:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient role")
        if payload.role == EWorkspaceRole.OWNER:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot grant the owner role")
        if member.role == EWorkspaceRole.OWNER:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot change the owner's role")
        member.role = payload.role
    else:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Provide role or accept")

    await db.commit()
    return member_out(member, ctx.workspace.slug)


@router.delete("/workspaces/{workspace_slug}/members/{member_id}/")
async def remove_member(
    member_id: str,
    ctx: WorkspaceContext = Depends(require_role(*ADMINS)),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    member = await _get_member(db, ctx.workspace.id, member_id)
    if member is not None:
        if member.role == EWorkspaceRole.OWNER:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot remove the owner")
        await db.delete(member)
        await db.commit()
        return {"success": True}

    invitation = (
        await db.execute(
            select(WorkspaceInvitation).where(
                WorkspaceInvitation.id == member_id,
                WorkspaceInvitation.workspace_id == ctx.workspace.id,
            )
        )
    ).scalar_one_or_none()
    if invitation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found")
    await db.delete(invitation)
    await db.commit()
    return {"success": True}


@router.get("/auth/me/pending-invites/", response_model=list[WorkspaceMemberOut])
async def my_pending_invites(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    rows = (
        await db.execute(
            select(WorkspaceMember, Workspace.slug)
            .join(Workspace, Workspace.id == WorkspaceMember.workspace_id)
            .options(selectinload(WorkspaceMember.user))
            .where(
                WorkspaceMember.user_id == user.id,
                WorkspaceMember.status == EMemberStatus.PENDING,
            )
            .order_by(WorkspaceMember.created_at)
        )
    ).all()

    # Both halves of "you have been invited": a membership an admin created from
    # the directory, and an invitation emailed to this address before the account
    # existed. Only the first used to be here, so someone who signed up without
    # the emailed token appeared to belong nowhere — and onboarding offered to
    # create the workspace they had already been invited to.
    members = [member_out(m, slug) for m, slug in rows]
    invitations = await invitations_service.live_invitations_for_email(db, user.email)
    if not invitations:
        return members

    slugs = dict(
        (
            await db.execute(
                select(Workspace.id, Workspace.slug).where(
                    Workspace.id.in_([i.workspace_id for i in invitations])
                )
            )
        ).all()
    )
    # A workspace deleted out from under a live invitation is nothing to show.
    return members + [
        invitation_out(i, slugs[i.workspace_id])
        for i in invitations
        if i.workspace_id in slugs
    ]
