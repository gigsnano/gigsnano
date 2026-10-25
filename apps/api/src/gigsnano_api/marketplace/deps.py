"""Route dependencies for scoped contractor access."""

from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.deps import get_current_user
from gigsnano_api.auth.models import User
from gigsnano_api.core.db import get_db
from gigsnano_api.marketplace import service as S
from gigsnano_api.marketplace.access import (
    EWorkItemAccessLevel,
    WorkItemAccess,
    resolve_work_item_access,
)
from gigsnano_api.models import EWorkspaceRole, MarketplaceListing, Project, Story, Workspace
from gigsnano_api.shared.context import WorkspaceContext, _resolve_context, require_role

ADMINS = (EWorkspaceRole.ADMIN, EWorkspaceRole.OWNER)


async def require_listing_admin(
    listing_id: str,
    ctx: WorkspaceContext = Depends(require_role(*ADMINS)),
    db: AsyncSession = Depends(get_db),
) -> tuple[WorkspaceContext, MarketplaceListing]:
    listing = await S.get_listing_or_404(db, listing_id)
    if listing.workspace_id != ctx.workspace.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Listing not found")
    return ctx, listing


@dataclass
class StoryRouteAccess:
    user: User
    project: Project
    story: Story
    access: WorkItemAccess
    member_ctx: WorkspaceContext | None = None


async def require_story_route_access(
    workspace_slug: str,
    project_id: str,
    story_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StoryRouteAccess:
    """Admit workspace members (full) or active contractors (scoped). Fails closed."""
    ws = (
        await db.execute(select(Workspace).where(Workspace.slug == workspace_slug))
    ).scalar_one_or_none()
    if ws is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workspace not found")

    project = await db.get(Project, project_id)
    if project is None or project.workspace_id != ws.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")

    story = await db.get(Story, story_id)
    if story is None or story.project_id != project.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Story not found")

    access = await resolve_work_item_access(db, user.id, story_id)
    if access.level == EWorkItemAccessLevel.NONE:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")

    member_ctx: WorkspaceContext | None = None
    if access.level == EWorkItemAccessLevel.MEMBER:
        member_ctx = await _resolve_context(db, workspace_slug, user, allow_pending=False)

    return StoryRouteAccess(
        user=user,
        project=project,
        story=story,
        access=access,
        member_ctx=member_ctx,
    )


def billing_workspace_id(route: StoryRouteAccess) -> str:
    """AI usage debits the owning workspace wallet — members and contractors alike."""
    if route.member_ctx is not None:
        return route.member_ctx.workspace.id
    return route.project.workspace_id


def workspace_slug_from_route(route: StoryRouteAccess, fallback_slug: str) -> str:
    if route.member_ctx is not None:
        return route.member_ctx.workspace.slug
    return fallback_slug


__all__ = [
    "ADMINS",
    "StoryRouteAccess",
    "billing_workspace_id",
    "require_listing_admin",
    "require_story_route_access",
    "workspace_slug_from_route",
]
