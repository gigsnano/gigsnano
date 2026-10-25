from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from gigsnano_api.models import (
    EInvitationStatus,
    EMemberStatus,
    EProjectRole,
    EWorkspaceRole,
)


class ProjectGrantOut(BaseModel):
    """Project access an invitation carries, applied when it is redeemed (GIN-529)."""

    project_id: str
    role: EProjectRole


class ProjectGrantIn(ProjectGrantOut):
    model_config = ConfigDict(extra="forbid")

    role: EProjectRole = EProjectRole.MEMBER


class AddMemberPayload(BaseModel):
    """Matches the frontend's IAddMemberPayload: exactly one of user_id | email."""

    user_id: str | None = None
    email: str | None = None
    role: EWorkspaceRole = EWorkspaceRole.MEMBER


class UpdateMemberPayload(BaseModel):
    role: EWorkspaceRole | None = None
    accept: bool | None = None


class WorkspaceMemberOut(BaseModel):
    """Matches the frontend's IWorkspaceMember (src/types/workspace.ts)."""

    id: str
    workspace_slug: str
    user_id: str
    display_name: str
    email: str
    avatar_url: str | None
    role: EWorkspaceRole
    status: EMemberStatus
    #: When they joined, or — for a row standing in for a pending invitation —
    #: when they were invited. The members table shows one column for both.
    created_at: datetime


class InvitationOut(BaseModel):
    """Matches the frontend's IWorkspaceInvitation (src/types/invitation.ts).

    Note: neither the accept token nor its hash is part of this shape. The raw
    token is knowable only at create/resend time (see `RecipientResultOut`).
    """

    id: str
    workspace_slug: str
    email: str
    role: EWorkspaceRole
    invited_by_name: str
    created_at: datetime
    #: Effective status — a PENDING row past its expiry reads as `expired` here,
    #: because nothing sweeps the table (see invitations/service.py).
    status: EInvitationStatus
    expires_at: datetime
    last_sent_at: datetime | None = None
    accepted_at: datetime | None = None
    resend_count: int = 0
    #: Projects this invitee joins on acceptance. The project screens read these
    #: to show "invited" people who have no account — and so no membership row —
    #: yet, without the project member list having to carry userless rows.
    project_grants: list[ProjectGrantOut] = []


class InviteBatchPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    #: Raw as typed. Normalization and dedup happen server-side too — a client
    #: that skips them must not be able to create two live invites for one
    #: address, so the browser's parsing is a convenience, not the guard.
    emails: list[str] = Field(min_length=1)
    role: EWorkspaceRole = EWorkspaceRole.MEMBER
    #: Optional project access to hand out on acceptance. Applies to every
    #: recipient in the batch — inviting four people to one project is the whole
    #: point of the batch endpoint.
    project_grants: list[ProjectGrantIn] = []


class RecipientResultOut(BaseModel):
    """One recipient's outcome. Every submitted address gets exactly one."""

    email: str
    outcome: str
    detail: str = ""
    invitation_id: str = ""
    #: Present only when this request minted a token — the single moment the raw
    #: value is knowable, which is what makes "copy invite link" possible.
    invite_url: str = ""


class InviteBatchOut(BaseModel):
    results: list[RecipientResultOut]


class MemberPreviewOut(BaseModel):
    """Frontend IMemberPreview — id is the member's user_id."""

    id: str
    display_name: str
    avatar_url: str | None
