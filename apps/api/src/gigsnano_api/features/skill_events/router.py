from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import get_db
from gigsnano_api.features.skill_events import service as S
from gigsnano_api.features.skill_events.schemas import (
    EventsOut,
    GateRequest,
    RecordEventPayload,
    SkillEventOut,
)
from gigsnano_api.marketplace.deps import StoryRouteAccess, require_story_route_access
from gigsnano_api.models.agent_runs import AgentRun
from gigsnano_api.shared.context import WorkspaceContext, get_workspace_context

router = APIRouter(tags=["skill-events"])
_R = "/workspaces/{workspace_slug}/projects/{project_id}/stories/{story_id}/runs/{run_id}/skill-events"


async def _load_run(db: AsyncSession, story_id: str, run_id: str) -> AgentRun:
    run = await db.get(AgentRun, run_id)
    if run is None or run.story_id != story_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")
    return run


def _event_out(e) -> SkillEventOut:
    return SkillEventOut(
        id=e.id, skill_id=e.skill_id, state=e.state.value, version=e.version,
        digest=e.digest, agent=e.agent, gate=e.gate, evidence=list(e.evidence or []),
        reason=e.reason,
    )


@router.post(_R + "/", response_model=SkillEventOut, status_code=status.HTTP_201_CREATED)
async def ingest_event(
    run_id: str,
    payload: RecordEventPayload,
    route: StoryRouteAccess = Depends(require_story_route_access),
    db: AsyncSession = Depends(get_db),
):
    run = await _load_run(db, route.story.id, run_id)
    ev = await S.record_event(
        db, run.id, skill_id=payload.skill_id, state=payload.state,
        dedupe_key=payload.dedupe_key, version=payload.version, digest=payload.digest,
        agent=payload.agent, gate=payload.gate, evidence=payload.evidence, reason=payload.reason,
    )
    await db.commit()
    return _event_out(ev)


@router.get(_R + "/", response_model=EventsOut)
async def list_events(
    run_id: str,
    route: StoryRouteAccess = Depends(require_story_route_access),
    db: AsyncSession = Depends(get_db),
):
    run = await _load_run(db, route.story.id, run_id)
    events = await S.list_events(db, run.id)
    return EventsOut(
        events=[_event_out(e) for e in events],
        current_states=await S.current_states(db, run.id),
    )


@router.get(_R + "/audit/")
async def audit(
    run_id: str,
    route: StoryRouteAccess = Depends(require_story_route_access),
    db: AsyncSession = Depends(get_db),
):
    run = await _load_run(db, route.story.id, run_id)
    return await S.audit(db, run.id)


@router.post(_R + "/gate/")
async def evaluate_gate(
    run_id: str,
    payload: GateRequest,
    route: StoryRouteAccess = Depends(require_story_route_access),
    db: AsyncSession = Depends(get_db),
):
    run = await _load_run(db, route.story.id, run_id)
    return await S.evaluate_gate(db, run.id, payload.required_skills, payload.gates)


@router.get("/workspaces/{workspace_slug}/skill-metrics/")
async def skill_metrics(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    return await S.metrics(db, ctx.workspace.id)
