
from pydantic import BaseModel

from gigsnano_api.models import EMemberStatus, EProjectRole


class AddProjectMemberPayload(BaseModel):
    """Like AddMemberPayload but scoped to a project: role is EProjectRole, not
    EWorkspaceRole (project membership roles are a distinct enum from workspace
    membership roles)."""

    user_id: str | None = None
    email: str | None = None
    role: EProjectRole = EProjectRole.MEMBER


class ProjectMemberOut(BaseModel):
    """Frontend IProjectMember."""

    id: str
    project_id: str
    user_id: str
    display_name: str
    email: str
    avatar_url: str | None
    role: EProjectRole
    status: EMemberStatus
