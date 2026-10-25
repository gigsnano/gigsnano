"""Workspace invitation lifecycle (GIN-526).

No HTTP concerns — the router owns status codes. Everything that decides whether
an invitation may still be redeemed lives here, so accept, list and resend cannot
drift apart on the expiry rule.
"""

import hashlib
import re
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import StrEnum

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.models import User
from gigsnano_api.core.config import settings
from gigsnano_api.models import (
    EInvitationStatus,
    EMemberStatus,
    EProjectRole,
    EWorkspaceRole,
    Project,
    ProjectMember,
    Workspace,
    WorkspaceInvitation,
    WorkspaceMember,
)

#: Deliberately permissive: this is a *shape* check to catch typos before we hand
#: an address to the mail provider, not an attempt to implement RFC 5322. The
#: authoritative test of an address is whether delivery succeeds. Separators are
#: excluded so a half-split paste ("a@x.io,b@y.io") is rejected rather than sent.
#: `\x3b` is a semicolon, written escaped to keep the line free of a literal `;`
#: that a line-based density check reads as a second statement.
_EMAIL_RE = re.compile(r"^[^\s@,\x3b]+@[^\s@,\x3b]+\.[^\s@,\x3b]+$")

#: Recipients accepted in one batch. Bounds the work a single request can queue;
#: the UI shows the limit before submission rather than truncating silently.
MAX_BATCH = 50

#: Disposable-mailbox providers. A workspace seat is an access grant, so an
#: address that self-destructs in ten minutes cannot be recovered, audited, or
#: used to reach the person again.
#:
#: ponytail: a static list of the common providers, not an exhaustive one — the
#: long tail runs to six figures of domains and goes stale weekly. This catches
#: the casual case at zero cost; if abuse ever justifies it, swap the set for a
#: maintained feed behind `is_disposable_email` and no caller changes.
#: Kept in sync by hand with `apps/web/src/lib/members/recipient-parse.ts`.
DISPOSABLE_DOMAINS: frozenset[str] = frozenset({
    "0-mail.com", "10minutemail.com", "20minutemail.com", "33mail.com",
    "burnermail.io", "dispostable.com", "emailondeck.com", "fakeinbox.com",
    "getairmail.com", "getnada.com", "guerrillamail.com", "guerrillamail.info",
    "harakirimail.com", "inboxbear.com", "mailcatch.com", "maildrop.cc",
    "mailinator.com", "mailnesia.com", "mintemail.com", "moakt.com",
    "mohmal.com", "mytemp.email", "sharklasers.com", "spam4.me",
    "temp-mail.io", "temp-mail.org", "tempmail.com", "tempmailo.com",
    "tempr.email", "throwawaymail.com", "trashmail.com", "trashmail.de",
    "yopmail.com", "yopmail.fr", "yopmail.net",
})


def normalize_email(raw: str) -> str:
    """Fold to the form uniqueness and comparison use. Display keeps the original."""
    return raw.strip().lower()


def is_valid_email(raw: str) -> bool:
    return bool(_EMAIL_RE.match(raw.strip()))


def is_disposable_email(raw: str) -> bool:
    """True for a known throwaway-mailbox provider.

    Subdomains count (`foo.mailinator.com`) because most of these hand them out
    freely. Matching is on domain boundaries, never substrings — `notmailinator.com`
    and `mailinator.com.example.io` are ordinary domains and must not be blocked.
    """
    domain = normalize_email(raw).rpartition("@")[2]
    if not domain:
        return False
    return domain in DISPOSABLE_DOMAINS or any(
        domain.endswith(f".{blocked}") for blocked in DISPOSABLE_DOMAINS
    )


def hash_token(raw_token: str) -> str:
    """SHA-256, not bcrypt: the token is 256 bits of `secrets` output, so it has
    no guessable structure to slow an attacker down over. What matters is that
    the stored form is not redeemable, and a fast hash keeps accept O(1)."""
    return hashlib.sha256(raw_token.encode()).hexdigest()


def new_token() -> str:
    return secrets.token_urlsafe(32)


def expiry_from_now() -> datetime:
    return datetime.now(UTC) + timedelta(days=settings.invitation_ttl_days)


def invite_link(raw_token: str) -> str:
    return f"{settings.app_base_url}/invitations/{raw_token}"


def _aware(value: datetime) -> datetime:
    """SQLite hands back naive datetimes even from a timezone=True column, so a
    direct comparison against an aware `now` raises. Treat naive as UTC."""
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def effective_status(invitation: WorkspaceInvitation) -> EInvitationStatus:
    """What the row *means* right now.

    Nothing sweeps expired invitations, so a PENDING row past `expires_at` is
    expired even though the column still says pending. Every reader goes through
    here rather than comparing dates itself.
    """
    if (
        invitation.status is EInvitationStatus.PENDING
        and _aware(invitation.expires_at) <= datetime.now(UTC)
    ):
        return EInvitationStatus.EXPIRED
    return invitation.status


# --- outcomes -------------------------------------------------------------


@dataclass(frozen=True)
class RecipientResult:
    """One recipient's outcome in a batch.

    Every recipient gets one of these, including the failures: a partial batch
    must never hide the invitations that did go out, which is what a single
    4xx for the whole request would do.
    """

    email: str
    # sent | resent | already_member | already_invited | invalid | disposable | failed
    outcome: str
    detail: str = ""
    invitation_id: str = ""
    #: Only populated for a recipient this request actually minted a token for —
    #: it is the one moment the raw token is knowable, and it powers "copy link".
    invite_url: str = ""


async def _existing_member(
    db: AsyncSession, workspace_id: str, email: str
) -> WorkspaceMember | None:
    return (
        await db.execute(
            select(WorkspaceMember)
            .join(User, User.id == WorkspaceMember.user_id)
            .where(WorkspaceMember.workspace_id == workspace_id, User.email == email)
        )
    ).scalar_one_or_none()


async def live_invitation(
    db: AsyncSession, workspace_id: str, email: str
) -> WorkspaceInvitation | None:
    """The one redeemable invitation for this address, if any. An expired row is
    not live — it is what makes re-inviting a lapsed address work."""
    invitation = (
        await db.execute(
            select(WorkspaceInvitation).where(
                WorkspaceInvitation.workspace_id == workspace_id,
                WorkspaceInvitation.email == email,
                WorkspaceInvitation.status == EInvitationStatus.PENDING,
            )
        )
    ).scalar_one_or_none()
    if invitation is None:
        return None
    return invitation if effective_status(invitation) is EInvitationStatus.PENDING else None


async def live_invitations_for_email(db: AsyncSession, email: str) -> list[WorkspaceInvitation]:
    """Every invitation this address can still redeem, in any workspace.

    The counterpart of `live_invitation` for the invitee's side of the flow:
    someone who signed up without the emailed token has an account and no
    membership, and this is the only thing that can tell them why.
    """
    rows = (
        await db.execute(
            select(WorkspaceInvitation).where(
                WorkspaceInvitation.email == normalize_email(email),
                WorkspaceInvitation.status == EInvitationStatus.PENDING,
            )
        )
    ).scalars().all()
    return [i for i in rows if effective_status(i) is EInvitationStatus.PENDING]


class RedeemBlock(StrEnum):
    """Why this account cannot redeem this invitation. `None` means it can."""

    WRONG_EMAIL = "wrong_email"
    EXPIRED = "expired"
    SETTLED = "settled"


def redeem_block(invitation: WorkspaceInvitation, user: User) -> RedeemBlock | None:
    """The shared gate for every accept path.

    The token authorizes, but the invitation is still bound to the address it was
    sent to, so a leaked token cannot be redeemed by an unrelated account. Both
    the token endpoint and the signed-in accept go through here — two accept
    paths with two notions of "still valid" is how one of them ends up wrong.
    """
    if invitation.email != user.email.lower():
        return RedeemBlock.WRONG_EMAIL
    state = effective_status(invitation)
    if state is EInvitationStatus.EXPIRED:
        return RedeemBlock.EXPIRED
    if state is not EInvitationStatus.PENDING:
        return RedeemBlock.SETTLED  # already spent, revoked, or delivery-failed
    return None


async def apply_project_grants(
    db: AsyncSession, workspace_id: str, grants: list[dict], user_id: str
) -> None:
    """Seat the invitee on the projects the inviter lined up (GIN-529).

    Grants were validated against the workspace when the invitation was written,
    and are re-checked here anyway: a project can be deleted, trashed or moved to
    another workspace while an invitation is outstanding, and a grant must never
    outlive the authority it was issued under. The workspace filter is the tenant
    boundary — without it a stale `project_id` would seat someone in a workspace
    nobody invited them to.
    """
    wanted = {g["project_id"]: g["role"] for g in grants or [] if g.get("project_id")}
    if not wanted:
        return

    # Trashed projects are excluded for free by the global soft-delete filter.
    live = set(
        (
            await db.execute(
                select(Project.id).where(
                    Project.id.in_(wanted),
                    Project.workspace_id == workspace_id,
                )
            )
        ).scalars().all()
    )
    # Re-invitations exist, so the invitee may already hold some of these rows;
    # `(project_id, user_id)` is unique and a duplicate insert would abort the
    # whole accept.
    taken = set(
        (
            await db.execute(
                select(ProjectMember.project_id).where(
                    ProjectMember.project_id.in_(wanted),
                    ProjectMember.user_id == user_id,
                )
            )
        ).scalars().all()
    )
    for project_id in live - taken:
        db.add(
            ProjectMember(
                project_id=project_id,
                user_id=user_id,
                role=EProjectRole(wanted[project_id]),
                status=EMemberStatus.ACTIVE,
            )
        )


async def redeem(
    db: AsyncSession, invitation: WorkspaceInvitation, user: User
) -> Workspace | None:
    """Settle the invitation and seat the user. Returns None if the workspace is gone.

    Callers must have cleared `redeem_block` first and must commit. Settling
    rather than deleting keeps the row as the audit record of who joined how;
    single-use is enforced by the status check in `redeem_block`.
    """
    workspace = await db.get(Workspace, invitation.workspace_id)
    if workspace is None:
        return None

    existing = (
        await db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == invitation.workspace_id,
                WorkspaceMember.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        db.add(
            WorkspaceMember(
                workspace_id=invitation.workspace_id,
                user_id=user.id,
                role=invitation.role,
                status=EMemberStatus.ACTIVE,
            )
        )
    await apply_project_grants(
        db, invitation.workspace_id, invitation.project_grants or [], user.id
    )
    invitation.status = EInvitationStatus.ACCEPTED
    invitation.accepted_at = datetime.now(UTC)
    user.last_workspace_slug = workspace.slug
    return workspace


def issue_token(invitation: WorkspaceInvitation) -> str:
    """Mint a fresh token onto the row and return the raw value once.

    Used by both create and resend. Resending rotates rather than re-sends the
    same secret, so a forwarded or leaked earlier link stops working the moment
    a new one is issued — which is the behaviour "invalidates the previous
    token" in the spec asks for.
    """
    raw = new_token()
    invitation.token_hash = hash_token(raw)
    invitation.expires_at = expiry_from_now()
    invitation.last_sent_at = datetime.now(UTC)
    return raw


async def prepare_recipient(
    db: AsyncSession,
    workspace: Workspace,
    inviter: User,
    raw_email: str,
    role: EWorkspaceRole,
    project_grants: list[dict] | None = None,
) -> tuple[RecipientResult, WorkspaceInvitation | None, str]:
    """Decide one recipient's fate. Returns `(result, row_to_send_for, raw_token)`.

    Does not commit — the router commits the whole batch once, so a mail
    provider hiccup on recipient 3 cannot leave recipients 1 and 2 half-written.

    `project_grants` replaces whatever a live invitation already carried rather
    than merging: the latest invitation is what the operator just decided, and a
    union would make it impossible to take a project back off an outstanding
    invite.
    """
    email = normalize_email(raw_email)
    if not is_valid_email(email):
        return RecipientResult(raw_email, "invalid", "Not a valid email address"), None, ""

    if is_disposable_email(email):
        # Enforced here rather than only in the dialog: the UI check is a
        # courtesy, and a request that skips it must still be refused.
        return (
            RecipientResult(
                email, "disposable", "Temporary email addresses aren't allowed"
            ),
            None,
            "",
        )

    member = await _existing_member(db, workspace.id, email)
    if member is not None:
        # There is nothing to invite them to, but the project access the operator
        # just asked for is the point of the request — dropping it because the
        # seat already exists is how "I invited them to the project and nothing
        # happened" happens. They have a user, so grant it now rather than
        # parking it on an invitation that will never be redeemed.
        await apply_project_grants(db, workspace.id, project_grants or [], member.user_id)
        detail = (
            "Already a member — added to the selected projects"
            if project_grants
            else "Already a member"
        )
        return RecipientResult(email, "already_member", detail), None, ""

    existing = await live_invitation(db, workspace.id, email)
    if existing is not None:
        # Re-inviting a live invitation resends it rather than minting a second
        # row: two live invitations for one address means two valid tokens, and
        # the partial unique index would reject the insert anyway.
        raw = issue_token(existing)
        existing.role = role
        existing.project_grants = project_grants or []
        existing.resend_count += 1
        return (
            RecipientResult(email, "resent", "Invitation resent", existing.id, invite_link(raw)),
            existing,
            raw,
        )

    invitation = WorkspaceInvitation(
        workspace_id=workspace.id,
        email=email,
        role=role,
        invited_by_id=inviter.id,
        status=EInvitationStatus.PENDING,
        expires_at=expiry_from_now(),
        project_grants=project_grants or [],
    )
    raw = issue_token(invitation)
    db.add(invitation)
    await db.flush()
    return (
        RecipientResult(email, "sent", "Invitation sent", invitation.id, invite_link(raw)),
        invitation,
        raw,
    )
