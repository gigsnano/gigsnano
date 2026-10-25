"""PM-reported health endpoints (GIN-337). Read is project-scoped via
get_project_or_404; writes additionally reject project Viewers. Kept apart from the
system-health endpoint (GIN-336) so PM judgment never overwrites the calculation."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import get_db
from gigsnano_api.models import Project
from gigsnano_api.shared.context import (
    WorkspaceContext,
    get_project_or_404,
    get_workspace_context,
)

from .schemas import CreatePmHealthUpdatePayload, PmHealthUpdateOut
from .service import (
    create_pm_update,
    latest_pm_update,
    list_pm_updates,
    retract_pm_update,
)

router = APIRouter(tags=["pm-health"])

_BASE = "/workspaces/{workspace_slug}/projects/{project_id}/pm-health"


@router.get(f"{_BASE}/", response_model=list[PmHealthUpdateOut])
async def get_pm_update_history(
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
):
    return await list_pm_updates(db, project)


@router.get(f"{_BASE}/latest/", response_model=PmHealthUpdateOut | None)
async def get_latest_pm_update(
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
):
    return await latest_pm_update(db, project)


@router.post(f"{_BASE}/", response_model=PmHealthUpdateOut, status_code=status.HTTP_201_CREATED)
async def post_pm_update(
    payload: CreatePmHealthUpdatePayload,
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    return await create_pm_update(db, project, ctx, payload)


@router.delete(f"{_BASE}/{{update_id}}/")
async def delete_pm_update(
    update_id: str,
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    await retract_pm_update(db, project, ctx, update_id)
    return {"success": True}
