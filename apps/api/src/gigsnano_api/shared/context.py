from dataclasses import dataclass
from typing import TYPE_CHECKING

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.deps import get_current_user
from gigsnano_api.auth.models import User
from gigsnano_api.core.db import get_db
from gigsnano_api.models import (
    EMemberStatus,
    EProjectRole,
    EWorkspaceRole,
    Project,
    ProjectMember,
    Workspace,
    WorkspaceMember,
)

if TYPE_CHECKING:  # runtime import lives inside the dependency (circular at module level)
    from gigsnano_api.shared.project_rbac import EProjectPermission


@dataclass
class WorkspaceContext:
    """Resolved tenant scope for one request. Every tenant-scoped route depends on this."""

    user: User
    workspace: Workspace
    role: EWorkspaceRole
    status: EMemberStatus


ADMINS = (EWorkspaceRole.ADMIN, EWorkspaceRole.OWNER)


async def _resolve_context(
    db: AsyncSession, workspace_slug: str, user: User, *, allow_pending: bool
) -> WorkspaceContext:
    result = await db.execute(select(Workspace).where(Workspace.slug == workspace_slug))
    workspace = result.scalar_one_or_none()
    if workspace is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workspace not found")
    conditions = [
        WorkspaceMember.workspace_id == workspace.id,
        WorkspaceMember.user_id == user.id,
    ]
    if not allow_pending:
        conditions.append(WorkspaceMember.status == EMemberStatus.ACTIVE)
    result = await db.execute(select(WorkspaceMember).where(*conditions))
    membership = result.scalar_one_or_none()
    if membership is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a member of this workspace")
    return WorkspaceContext(
        user=user, workspace=workspace, role=membership.role, status=membership.status
    )


async def get_workspace_context(
    workspace_slug: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WorkspaceContext:
    return await _resolve_context(db, workspace_slug, user, allow_pending=False)


async def get_workspace_context_incl_pending(
    workspace_slug: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WorkspaceContext:
    """Like `get_workspace_context` but also admits PENDING members.

    The accept-invitation path needs this: a pending invitee is not yet an active
    member, so the strict context would 403 them out of accepting their own invite.
    Admin-gated branches remain protected by the `ctx.role in ADMINS` checks downstream.
    """
    return await _resolve_context(db, workspace_slug, user, allow_pending=True)


def require_role(*roles: EWorkspaceRole):
    async def dependency(
        ctx: WorkspaceContext = Depends(get_workspace_context),
    ) -> WorkspaceContext:
        if ctx.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient role")
        return ctx

    return dependency


async def user_is_project_member(db: AsyncSession, user_id: str, project_id: str) -> bool:
    """True if `user_id` is an ACTIVE member of `project_id`."""
    member = (
        await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == user_id,
                ProjectMember.status == EMemberStatus.ACTIVE,
            )
        )
    ).scalar_one_or_none()
    return member is not None


async def accessible_project_ids(db: AsyncSession, ctx: WorkspaceContext) -> list[str] | None:
    """Project ids in ctx.workspace the caller may see. None = ALL (Owner/Admin)."""
    if ctx.role in ADMINS:
        return None
    rows = await db.execute(
        select(ProjectMember.project_id)
        .join(Project, Project.id == ProjectMember.project_id)
        .where(
            Project.workspace_id == ctx.workspace.id,
            ProjectMember.user_id == ctx.user.id,
            ProjectMember.status == EMemberStatus.ACTIVE,
        )
    )
    return [r[0] for r in rows.all()]


def narrow_project_ids(ids: list[str] | None, project_ids: str | None) -> list[str] | None:
    """Intersect the caller's visible projects with a requested comma list.

    Narrows only, never widens: an id the caller can't see is dropped, so an
    all-invisible request yields `[]` (nothing), not the whole workspace.
    Absent or blank `project_ids` returns `ids` unchanged.
    """
    requested = [p for p in (s.strip() for s in (project_ids or "").split(",")) if p]
    if not requested:
        return ids
    if ids is None:
        return requested
    visible = set(ids)
    return [p for p in requested if p in visible]


async def get_project_or_404(
    project_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> Project:
    project = await db.get(Project, project_id)
    if project is None or project.workspace_id != ctx.workspace.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    # Owner/Admin see every project in their workspace (governance). Everyone else
    # must be an active member of this specific project.
    if ctx.role not in ADMINS:
        if not await user_is_project_member(db, ctx.user.id, project.id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return project


async def reject_if_project_viewer(
    db: AsyncSession, ctx: WorkspaceContext, project_id: str
) -> None:
    """403s if `ctx.user` is a project-scoped VIEWER on `project_id`. Workspace
    Owner/Admin bypass (governance). Shared by `require_project_write_access`
    and routes that resolve project access outside `get_project_or_404` (e.g.
    the story routes gated by `require_story_route_access`, and the documents
    router which resolves its project via the artifact row)."""
    if ctx.role in ADMINS:
        return
    member = (
        await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == ctx.user.id,
                ProjectMember.status == EMemberStatus.ACTIVE,
            )
        )
    ).scalar_one_or_none()
    if member is not None and member.role == EProjectRole.VIEWER:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Viewers have read-only access")


async def require_project_write_access(
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> Project:
    """Like `get_project_or_404`, but additionally 403s a project-scoped
    VIEWER on write routes (POST/PATCH/PUT/DELETE) (GIN-22 Part B — Viewer is
    the project's read-only tier). This is the DELIVER tier (work items, comments,
    documents); project *configuration* uses require_project_permission below."""
    await reject_if_project_viewer(db, ctx, project.id)
    return project


async def project_role_of(
    db: AsyncSession, user_id: str, project_id: str
) -> "EProjectRole | None":
    """The caller's ACTIVE project role, or None if not an active member."""
    member = (
        await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == user_id,
                ProjectMember.status == EMemberStatus.ACTIVE,
            )
        )
    ).scalar_one_or_none()
    return member.role if member is not None else None


def require_project_permission(permission: "EProjectPermission"):
    """Server-side capability gate (GIN-318/323): the single, authoritative check
    for a project-scoped action. Applied AFTER authentication + workspace scoping +
    project membership (via get_project_or_404). Workspace Owner/Admin keep a
    documented governance override; otherwise the caller needs the permission on
    their project role, or it's a consistent 403. UI hiding is never the boundary."""
    from gigsnano_api.shared.project_rbac import can

    async def dependency(
        project: Project = Depends(get_project_or_404),
        ctx: WorkspaceContext = Depends(get_workspace_context),
        db: AsyncSession = Depends(get_db),
    ) -> Project:
        project_role = await project_role_of(db, ctx.user.id, project.id)
        if not can(ctx.role, project_role, permission):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "You do not have permission to perform this action on this project",
            )
        return project

    return dependency
