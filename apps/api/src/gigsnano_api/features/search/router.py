"""Unified multi-entity search (GIN-35): `GET /workspaces/{slug}/search/`.
Mirrors Plane's `GlobalSearchEndpoint` — one query per entity, each access-scoped
via `accessible_project_ids`, grouped into a single response."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import get_db
from gigsnano_api.features.search import service as SearchService
from gigsnano_api.features.search.schemas import (
    CycleResultOut,
    ModuleResultOut,
    PageResultOut,
    ProjectResultOut,
    SearchResultsOut,
    ViewResultOut,
    WorkItemResultOut,
)
from gigsnano_api.shared.context import (
    WorkspaceContext,
    accessible_project_ids,
    get_workspace_context,
)

router = APIRouter(tags=["search"])


@router.get("/workspaces/{workspace_slug}/search/", response_model=SearchResultsOut)
async def workspace_search(
    q: str | None = None,
    scope: str = "workspace",
    project_id: str | None = None,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    ids = await accessible_project_ids(db, ctx)
    if scope == "project" and project_id:
        # Plane's `workspace_search=false` case: restrict to one project, still
        # intersected with what the caller may actually see.
        ids = [project_id] if ids is None or project_id in ids else []

    workspace_id = ctx.workspace.id
    projects = await SearchService.search_projects(db, workspace_id, q, ids)
    work_items = await SearchService.search_work_items(db, workspace_id, q, ids)
    cycles = await SearchService.search_cycles(db, workspace_id, q, ids)
    modules = await SearchService.search_modules(db, workspace_id, q, ids)
    views = await SearchService.search_views(db, workspace_id, q, ids)
    pages = await SearchService.search_pages(db, workspace_id, q, ids)

    return SearchResultsOut(
        projects=[
            ProjectResultOut(id=p.id, name=p.name, identifier=p.identifier) for p in projects
        ],
        work_items=[
            WorkItemResultOut(
                id=w.id, project_id=w.project_id, title=w.title, story_number=w.story_number
            )
            for w in work_items
        ],
        cycles=[CycleResultOut(id=c.id, project_id=c.project_id, name=c.name) for c in cycles],
        modules=[ModuleResultOut(id=m.id, project_id=m.project_id, name=m.name) for m in modules],
        views=[ViewResultOut(id=v.id, project_id=v.project_id, name=v.name) for v in views],
        pages=[PageResultOut(id=pg.id, project_id=pg.project_id, title=pg.title) for pg in pages],
    )
