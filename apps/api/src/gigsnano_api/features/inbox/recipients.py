"""Who takes governance decisions on a project (the push/notification audience).

Lives beside `inbox/service.py` because it is the same rule as `_scope`: a user
decides where `can(workspace_role, project_role, MANAGE_SETTINGS)` holds.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.models import EMemberStatus, EWorkspaceRole, ProjectMember, WorkspaceMember
from gigsnano_api.shared.project_rbac import EProjectPermission, can

_GOVERNANCE_ROLES = (EWorkspaceRole.OWNER, EWorkspaceRole.ADMIN)


async def decision_makers(db: AsyncSession, workspace_id: str, project_id: str) -> list[str]:
    """User ids who may decide on `project_id`, de-duplicated (two queries)."""
    project_rows = await db.execute(
        select(ProjectMember.user_id, ProjectMember.role, WorkspaceMember.role)
        .join(
            WorkspaceMember,
            (WorkspaceMember.user_id == ProjectMember.user_id)
            & (WorkspaceMember.workspace_id == workspace_id)
            & (WorkspaceMember.status == EMemberStatus.ACTIVE),
        )
        .where(
            ProjectMember.project_id == project_id,
            ProjectMember.status == EMemberStatus.ACTIVE,
        )
    )
    ids = {
        uid
        for uid, project_role, ws_role in project_rows.all()
        if can(ws_role, project_role, EProjectPermission.MANAGE_SETTINGS)
    }
    admin_rows = await db.execute(
        select(WorkspaceMember.user_id).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.status == EMemberStatus.ACTIVE,
            WorkspaceMember.role.in_(_GOVERNANCE_ROLES),
        )
    )
    ids.update(admin_rows.scalars())
    return sorted(ids)


async def notify_decision_makers(
    db: AsyncSession,
    workspace_id: str,
    project_id: str,
    *,
    actor_id: str | None,
    title: str,
    body: str = "",
) -> None:
    """Add a REVIEW notification (and its push) for every decision maker except the
    actor. No commit: rides the caller's transaction."""
    from gigsnano_api.features.notifications.router import notify
    from gigsnano_api.models import ENotificationKind

    for user_id in await decision_makers(db, workspace_id, project_id):
        if user_id == actor_id:
            continue
        await notify(
            db,
            workspace_id,
            receiver_id=user_id,
            kind=ENotificationKind.REVIEW,
            title=title,
            body=body,
            triggered_by_id=actor_id,
            project_id=project_id,
            href="/inbox",
        )
