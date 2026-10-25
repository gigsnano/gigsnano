"""Workspace analytics — computed per-request from live aggregations (mirrors the
frontend buildAnalytics). No table, no cache."""

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.bmad.unlock import rollup_progress, sprint_zero_status
from gigsnano_api.core.db import get_db
from gigsnano_api.features.analytics.schemas import (
    ActiveCycleDetailOut,
    ProjectProgressOut,
    VelocityOut,
    WorkspaceAnalyticsOut,
)
from gigsnano_api.models import (
    Cycle,
    ECycleStatus,
    EMemberStatus,
    EStoryStatus,
    Project,
    Story,
    WorkspaceMember,
)
from gigsnano_api.shared.context import (
    WorkspaceContext,
    accessible_project_ids,
    get_workspace_context,
    narrow_project_ids,
)
from gigsnano_api.shared.serializers import _cycle_story_counts, _sprint_zero_stories

router = APIRouter(tags=["analytics"])


@router.get("/workspaces/{workspace_slug}/analytics/", response_model=WorkspaceAnalyticsOut)
async def get_analytics(
    # Comma list — a dashboard's project filter. Narrows every figure below.
    project_ids: str | None = None,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    ws = ctx.workspace
    ids = narrow_project_ids(await accessible_project_ids(db, ctx), project_ids)
    project_stmt = select(Project).where(Project.workspace_id == ws.id).order_by(Project.created_at)
    if ids is not None:
        project_stmt = project_stmt.where(Project.id.in_(ids))
    projects = (await db.execute(project_stmt)).scalars().all()
    pname = {p.id: p.name for p in projects}

    active_projects = sprint_zero_complete = 0
    project_progress: list[ProjectProgressOut] = []
    for p in projects:
        s0 = await _sprint_zero_stories(db, p.id)
        if sprint_zero_status(s0) == "complete":
            sprint_zero_complete += 1
        else:
            active_projects += 1
        project_progress.append(ProjectProgressOut(
            project_id=p.id, project_name=p.name, identifier=p.identifier,
            progress_pct=rollup_progress(s0)))

    total_stories_stmt = (
        select(func.count()).select_from(Story).join(Project, Story.project_id == Project.id)
        .where(Project.workspace_id == ws.id)
    )
    completed_stories_stmt = (
        select(func.count()).select_from(Story).join(Project, Story.project_id == Project.id)
        .where(Project.workspace_id == ws.id, Story.status == EStoryStatus.DONE)
    )
    active_cycles_stmt = (
        select(Cycle).join(Project, Cycle.project_id == Project.id)
        .where(Project.workspace_id == ws.id, Cycle.status == ECycleStatus.ACTIVE)
        .order_by(Cycle.created_at)
    )
    if ids is not None:
        total_stories_stmt = total_stories_stmt.where(Story.project_id.in_(ids))
        completed_stories_stmt = completed_stories_stmt.where(Story.project_id.in_(ids))
        active_cycles_stmt = active_cycles_stmt.where(Cycle.project_id.in_(ids))
    total_stories = (await db.execute(total_stories_stmt)).scalar_one()
    completed_stories = (await db.execute(completed_stories_stmt)).scalar_one()
    active_cycles = (await db.execute(active_cycles_stmt)).scalars().all()

    velocity: list[VelocityOut] = []
    for c in [c for c in active_cycles if not c.is_sprint_zero][:6]:
        total, done = await _cycle_story_counts(db, c.id)
        velocity.append(VelocityOut(cycle_name=c.name, project_name=pname.get(c.project_id, ""),
                                    completed=done, committed=total))

    active_cycle_details: list[ActiveCycleDetailOut] = []
    for c in active_cycles:
        total, done = await _cycle_story_counts(db, c.id)
        active_cycle_details.append(ActiveCycleDetailOut(
            cycle_id=c.id, cycle_name=c.name, project_id=c.project_id,
            project_name=pname.get(c.project_id, ""), story_count=total,
            completed_story_count=done, end_date=c.end_date))

    members_active = (await db.execute(
        select(func.count()).select_from(WorkspaceMember)
        .where(WorkspaceMember.workspace_id == ws.id,
               WorkspaceMember.status == EMemberStatus.ACTIVE)
    )).scalar_one()

    return WorkspaceAnalyticsOut(
        workspace_slug=ws.slug, active_projects=active_projects, total_projects=len(projects),
        active_cycles=len(active_cycles), completed_stories=completed_stories,
        total_stories=total_stories, sprint_zero_complete=sprint_zero_complete,
        members_active=members_active, project_progress=project_progress,
        velocity=velocity, active_cycle_details=active_cycle_details)
