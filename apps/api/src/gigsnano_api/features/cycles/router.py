from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import get_db
from gigsnano_api.features.cycles.progress import build_cycle_progress
from gigsnano_api.features.cycles.schemas import CreateCyclePayload, CycleOut, UpdateCyclePayload
from gigsnano_api.features.projects.router import record_activity
from gigsnano_api.features.stories.schemas import StoryOut
from gigsnano_api.models import Cycle, EProjectActivityType, Project, Story
from gigsnano_api.shared.context import (
    WorkspaceContext,
    get_project_or_404,
    get_workspace_context,
    require_project_write_access,
)
from gigsnano_api.shared.serializers import serialize_cycle, serialize_stories

router = APIRouter(tags=["cycles"])


async def _get_cycle_or_404(db: AsyncSession, project: Project, cycle_id: str) -> Cycle:
    cycle = await db.get(Cycle, cycle_id)
    if cycle is None or cycle.project_id != project.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cycle not found")
    return cycle


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/cycles/",
    response_model=list[CycleOut],
)
async def list_cycles(
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    cycles = (
        await db.execute(
            select(Cycle).where(Cycle.project_id == project.id).order_by(Cycle.created_at)
        )
    ).scalars()
    return [await serialize_cycle(db, c, ctx.workspace.slug) for c in cycles.all()]


@router.post(
    "/workspaces/{workspace_slug}/projects/{project_id}/cycles/",
    response_model=CycleOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_cycle(
    payload: CreateCyclePayload,
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    cycle = Cycle(project_id=project.id, **payload.model_dump())
    db.add(cycle)
    record_activity(
        db, project.id, EProjectActivityType.CYCLE, ctx.user, f"created cycle {cycle.name}"
    )
    await db.commit()
    return await serialize_cycle(db, cycle, ctx.workspace.slug)


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/cycles/{cycle_id}/",
    response_model=CycleOut,
)
async def get_cycle(
    cycle_id: str,
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    cycle = await _get_cycle_or_404(db, project, cycle_id)
    return await serialize_cycle(db, cycle, ctx.workspace.slug)


@router.patch(
    "/workspaces/{workspace_slug}/projects/{project_id}/cycles/{cycle_id}/",
    response_model=CycleOut,
)
async def update_cycle(
    cycle_id: str,
    payload: UpdateCyclePayload,
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    cycle = await _get_cycle_or_404(db, project, cycle_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(cycle, field, value)
    await db.commit()
    return await serialize_cycle(db, cycle, ctx.workspace.slug)


@router.delete("/workspaces/{workspace_slug}/projects/{project_id}/cycles/{cycle_id}/")
async def delete_cycle(
    cycle_id: str,
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict:
    cycle = await _get_cycle_or_404(db, project, cycle_id)
    record_activity(
        db, project.id, EProjectActivityType.CYCLE, ctx.user, f"deleted cycle {cycle.name}"
    )
    await db.delete(cycle)
    await db.commit()
    return {"success": True}


@router.get("/workspaces/{workspace_slug}/projects/{project_id}/cycles/{cycle_id}/progress/")
async def cycle_progress(
    cycle_id: str,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
) -> dict:
    cycle = await _get_cycle_or_404(db, project, cycle_id)
    stories = (
        await db.execute(select(Story).where(Story.cycle_id == cycle.id))
    ).scalars().all()
    return build_cycle_progress(cycle, list(stories), today=date.today())


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/cycles/{cycle_id}/stories/",
    response_model=list[StoryOut],
)
async def cycle_stories(
    cycle_id: str,
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    cycle = await _get_cycle_or_404(db, project, cycle_id)
    stories = (
        await db.execute(
            select(Story)
            .where(Story.cycle_id == cycle.id, Story.project_id == project.id)
            .order_by(Story.sort_order)
        )
    ).scalars()
    return await serialize_stories(db, list(stories.all()), ctx.workspace.slug)
