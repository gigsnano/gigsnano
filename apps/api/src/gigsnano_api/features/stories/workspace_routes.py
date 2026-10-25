"""Workspace-scoped story routes: the cross-project lists (all stories, my
stories, trash) and workspace-wide code resolution. Mounted onto the project
router in `router.py`, so the app still includes a single stories router."""


from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.deps import get_current_user
from gigsnano_api.auth.models import User
from gigsnano_api.content.fields import parse_content_format
from gigsnano_api.core.db import get_db
from gigsnano_api.core.pagination import OffsetPageOut
from gigsnano_api.features.stories.labels import load_story_label_ids
from gigsnano_api.features.stories.queries import (
    _apply_story_gigsql,
    _clamp_page,
    _search_clause,
    _search_rank,
    _story_page,
)
from gigsnano_api.features.stories.schemas import (
    AssignedStoryOut,
    StoryOut,
    TrashedStoryOut,
)
from gigsnano_api.features.stories.service import (
    _resolve_workspace_code,
    _serialize_one,
)
from gigsnano_api.models import (
    EStoryStatus,
    Project,
    Story,
    StorySubscription,
)
from gigsnano_api.shared.context import (
    ADMINS,
    WorkspaceContext,
    accessible_project_ids,
    get_workspace_context,
    narrow_project_ids,
    user_is_project_member,
)
from gigsnano_api.shared.serializers import (
    serialize_story,
    sub_issue_counts,
)

router = APIRouter(tags=["stories"])


@router.get("/workspaces/{workspace_slug}/stories/", response_model=OffsetPageOut[StoryOut])
async def workspace_stories(
    q: str | None = None,
    gigsql: str | None = None,
    product_only: bool = False,
    status: EStoryStatus | None = None,
    assignee_id: str | None = None,
    watching: bool = False,
    project_ids: str | None = None,
    limit: int = 30,
    offset: int = 0,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    limit, offset = _clamp_page(limit, offset)
    ids = narrow_project_ids(await accessible_project_ids(db, ctx), project_ids)
    list_stmt = (
        select(Story)
        .join(Project, Project.id == Story.project_id)
        .where(Project.workspace_id == ctx.workspace.id)
    )
    count_stmt = (
        select(func.count(Story.id))
        .join(Project, Project.id == Story.project_id)
        .where(Project.workspace_id == ctx.workspace.id)
    )
    if ids is not None:
        list_stmt = list_stmt.where(Story.project_id.in_(ids))
        count_stmt = count_stmt.where(Story.project_id.in_(ids))
    if product_only:
        list_stmt = list_stmt.where(Story.bmad_workflow.is_(None))
        count_stmt = count_stmt.where(Story.bmad_workflow.is_(None))
    if status is not None:
        list_stmt = list_stmt.where(Story.status == status)
        count_stmt = count_stmt.where(Story.status == status)
    if assignee_id:
        list_stmt = list_stmt.where(Story.assignee_id == assignee_id)
        count_stmt = count_stmt.where(Story.assignee_id == assignee_id)
    if watching:
        # Always the caller's own subscriptions -- there is no watcher_id param, so
        # this can't be pointed at someone else's watch list.
        watched = select(StorySubscription.story_id).where(
            StorySubscription.user_id == ctx.user.id
        )
        list_stmt = list_stmt.where(Story.id.in_(watched))
        count_stmt = count_stmt.where(Story.id.in_(watched))
    search = _search_clause(q, Project.identifier)
    if search is not None:
        list_stmt = list_stmt.where(search)
        count_stmt = count_stmt.where(search)
    list_stmt, count_stmt = _apply_story_gigsql(
        list_stmt, count_stmt, gigsql, ctx.user.id
    )
    if search is not None:
        # Relevance first (exact code/title beat description hits); created_at + id
        # give a stable total order so items don't shuffle between pages (GIN-365).
        list_stmt = list_stmt.order_by(
            _search_rank(q, Project.identifier), Story.created_at, Story.id
        )
    else:
        list_stmt = list_stmt.order_by(Story.created_at, Story.id)
    return await _story_page(db, list_stmt, count_stmt, ctx.workspace.slug, limit, offset)


@router.get(
    "/workspaces/{workspace_slug}/stories/resolve/{code}",
    response_model=StoryOut,
)
async def resolve_workspace_story(
    code: str,
    # Outbound format preference (GIN-304). "markdown" is honoured only when the
    # row has a canonical copy to render from; the response's `content_format`
    # reports what the caller actually got.
    content_format: str = "html",
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    project, story = await _resolve_workspace_code(db, ctx.workspace.id, code)
    if ctx.role not in ADMINS and not await user_is_project_member(db, ctx.user.id, project.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No work item '{code}'")
    return await _serialize_one(
        db, story, ctx.workspace.slug, project.identifier,
        want_format=parse_content_format(content_format, default="html"),
    )


@router.get("/workspaces/{workspace_slug}/my-stories/", response_model=OffsetPageOut[AssignedStoryOut])
async def my_stories(
    open_only: bool = True,
    limit: int = 30,
    offset: int = 0,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    limit, offset = _clamp_page(limit, offset)
    base = (
        select(Story, Project.name, Project.identifier)
        .join(Project, Project.id == Story.project_id)
        .where(Project.workspace_id == ctx.workspace.id, Story.assignee_id == user.id)
    )
    count_stmt = (
        select(func.count(Story.id))
        .join(Project, Project.id == Story.project_id)
        .where(Project.workspace_id == ctx.workspace.id, Story.assignee_id == user.id)
    )
    if open_only:
        base = base.where(Story.status != EStoryStatus.DONE, Story.bmad_skipped.is_(False))
        count_stmt = count_stmt.where(Story.status != EStoryStatus.DONE, Story.bmad_skipped.is_(False))
    total = int((await db.scalar(count_stmt)) or 0)
    rows = list(
        (await db.execute(base.order_by(Story.updated_at.desc()).limit(limit).offset(offset))).all()
    )
    counts = await sub_issue_counts(db, [s.id for s, _, _ in rows])
    labels = await load_story_label_ids(db, [s.id for s, _, _ in rows])
    items = [
        AssignedStoryOut(
            **serialize_story(
                s, ctx.workspace.slug, counts, identifier, label_ids=labels
            ).model_dump(),
            project_name=name,
            project_identifier=identifier,
        )
        for s, name, identifier in rows
    ]
    return OffsetPageOut(items=items, total=total, limit=limit, offset=offset)


@router.get(
    "/workspaces/{workspace_slug}/trash/", response_model=OffsetPageOut[TrashedStoryOut]
)
async def workspace_trash(
    q: str | None = None,
    limit: int = 30,
    offset: int = 0,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    """Workspace-wide trash (GIN-97): soft-deleted work items across every project
    the caller can access, newest-deleted first, searchable by title/description."""
    limit, offset = _clamp_page(limit, offset)
    ids = await accessible_project_ids(db, ctx)
    base = (
        select(Story, Project.name, Project.identifier)
        .join(Project, Project.id == Story.project_id)
        .where(Project.workspace_id == ctx.workspace.id, Story.deleted_at.is_not(None))
        .execution_options(include_deleted=True)
    )
    count_stmt = (
        select(func.count(Story.id))
        .join(Project, Project.id == Story.project_id)
        .where(Project.workspace_id == ctx.workspace.id, Story.deleted_at.is_not(None))
        .execution_options(include_deleted=True)
    )
    if ids is not None:
        base = base.where(Story.project_id.in_(ids))
        count_stmt = count_stmt.where(Story.project_id.in_(ids))
    search = _search_clause(q, Project.identifier)
    if search is not None:
        base = base.where(search)
        count_stmt = count_stmt.where(search)
    total = int((await db.scalar(count_stmt)) or 0)
    rows = list(
        (
            await db.execute(
                base.order_by(Story.deleted_at.desc()).limit(limit).offset(offset)
            )
        ).all()
    )
    counts = await sub_issue_counts(db, [s.id for s, _, _ in rows])
    labels = await load_story_label_ids(db, [s.id for s, _, _ in rows])
    items = [
        TrashedStoryOut(
            **serialize_story(
                s, ctx.workspace.slug, counts, identifier, label_ids=labels
            ).model_dump(),
            project_name=name,
            project_identifier=identifier,
            deleted_at=s.deleted_at,
            deleted_by_id=s.deleted_by_id,
        )
        for s, name, identifier in rows
    ]
    return OffsetPageOut(items=items, total=total, limit=limit, offset=offset)
