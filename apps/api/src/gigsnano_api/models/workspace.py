import enum
import secrets
from datetime import datetime

from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from gigsnano_api.auth.models import User
from gigsnano_api.models.base import JSON_DOC, TimestampedBase, _values


def _invite_token() -> str:
    return secrets.token_urlsafe(32)


class EWorkspaceRole(str, enum.Enum):
    """Serialized values match the frontend's EWorkspaceRole."""

    GUEST = "guest"
    MEMBER = "member"
    ADMIN = "admin"
    OWNER = "owner"


class EMemberStatus(str, enum.Enum):
    ACTIVE = "active"
    PENDING = "pending"


class EInvitationStatus(str, enum.Enum):
    """Explicit invitation lifecycle (GIN-526).

    EXPIRED is derived, not swept: nothing scans the table, so a row stays
    PENDING past its `expires_at` until something reads it. Readers must treat
    "PENDING and past expiry" as expired — `service.redeemable_state` is the one
    place that decides, so the rule cannot drift between accept and list.
    """

    PENDING = "pending"
    ACCEPTED = "accepted"
    EXPIRED = "expired"
    REVOKED = "revoked"
    DELIVERY_FAILED = "delivery_failed"


class ETransferStatus(str, enum.Enum):
    """Lifecycle of a GitHub-style project transfer request (GIN-85)."""

    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    CANCELLED = "cancelled"


ROLE_ENUM = Enum(EWorkspaceRole, name="workspace_role", values_callable=_values)
STATUS_ENUM = Enum(EMemberStatus, name="member_status", values_callable=_values)
TRANSFER_STATUS_ENUM = Enum(
    ETransferStatus, name="transfer_status", values_callable=_values
)
INVITATION_STATUS_ENUM = Enum(
    EInvitationStatus, name="invitation_status", values_callable=_values
)


class Workspace(TimestampedBase):
    __tablename__ = "workspaces"

    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    logo_url: Mapped[str | None] = mapped_column(String(500), default=None)
    #: Non-working days, as `[{"date": "YYYY-MM-DD", "name": "..."}]`.
    #:
    #: A column rather than a table: the list is small, bounded by the year, and
    #: never queried a row at a time — every reader wants the whole calendar. It
    #: is per workspace because there is no one right answer across tenants (a
    #: UAE workspace and an Indian one share almost no public holidays).
    holidays: Mapped[list] = mapped_column(JSON_DOC, default=list)

    members: Mapped[list["WorkspaceMember"]] = relationship(
        back_populates="workspace", cascade="all, delete-orphan"
    )


class WorkspaceMember(TimestampedBase):
    __tablename__ = "workspace_members"
    __table_args__ = (UniqueConstraint("workspace_id", "user_id"),)

    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[EWorkspaceRole] = mapped_column(ROLE_ENUM, default=EWorkspaceRole.MEMBER)
    status: Mapped[EMemberStatus] = mapped_column(STATUS_ENUM, default=EMemberStatus.ACTIVE)

    workspace: Mapped[Workspace] = relationship(back_populates="members")
    user: Mapped[User] = relationship()


class WorkspaceInvitation(TimestampedBase):
    """Invite for an email with no matching user yet (spec §3, invitations).

    Rows are retained after they resolve rather than deleted, so the Invitations
    screen can show history (who was invited, by whom, what happened). That is
    why uniqueness is a *partial* index over PENDING only: one live invite per
    address, any number of settled ones behind it.
    """

    __tablename__ = "workspace_invitations"
    __table_args__ = (
        Index(
            "uq_invitation_ws_email_pending",
            "workspace_id",
            "email",
            unique=True,
            sqlite_where=text("status = 'pending'"),
            postgresql_where=text("status = 'pending'"),
        ),
    )

    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    #: Normalized (trimmed + lowercased) by the service before it reaches here —
    #: comparison and uniqueness both depend on it, so a display-cased copy would
    #: silently let "Ada@x.com" and "ada@x.com" both hold a live invite.
    email: Mapped[str] = mapped_column(String(320))
    role: Mapped[EWorkspaceRole] = mapped_column(ROLE_ENUM, default=EWorkspaceRole.MEMBER)
    invited_by_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    #: SHA-256 of the accept token. The raw token exists only in the email and in
    #: the create/resend response (for "copy link") — a database leak must not
    #: hand over redeemable invitations.
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    status: Mapped[EInvitationStatus] = mapped_column(
        INVITATION_STATUS_ENUM, default=EInvitationStatus.PENDING, index=True
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )
    #: Project access to apply the moment this invitation is redeemed, as
    #: `[{"project_id": "...", "role": "member"}]` (GIN-529).
    #:
    #: A column rather than a `project_invitations` table: the grant has no
    #: lifecycle of its own. It is created, revoked and settled by the single
    #: invitation that carries it, and a second table would mean a second
    #: expiry/resend/revoke/accept to keep in step with this one — which is
    #: exactly how someone ends up half-invited.
    project_grants: Mapped[list] = mapped_column(JSON_DOC, default=list)
    #: Bumped on every send, including the first, so "invited 3 days ago" reflects
    #: the last thing the recipient actually received rather than row creation.
    last_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )
    resend_count: Mapped[int] = mapped_column(Integer, default=0)

    invited_by: Mapped[User] = relationship()


class ProjectTransferRequest(TimestampedBase):
    """A pending GitHub-style project transfer awaiting the destination owner's
    acceptance (GIN-85). The source admin creates it; an email link lets the
    destination workspace owner accept, which reassigns the project's workspace.
    The destination admin no longer needs to be the initiator's own account."""

    __tablename__ = "project_transfer_requests"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    source_workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    dest_workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    # The destination owner's email at request time (accept is bound to it).
    invited_email: Mapped[str] = mapped_column(String(320))
    created_by_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    status: Mapped[ETransferStatus] = mapped_column(
        TRANSFER_STATUS_ENUM, default=ETransferStatus.PENDING, index=True
    )
    # Secret accept/decline token delivered by email; never returned by the API.
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True, default=_invite_token)
