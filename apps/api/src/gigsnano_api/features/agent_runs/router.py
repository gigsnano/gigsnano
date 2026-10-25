"""Read + replay surface for agent runs (GIN-251): list/get a run with its
ordered steps, and an SSE replay of the step timeline. Live background execution
+ cost billing is triggered by the assignment story (GIN-180); this is the
durable read/stream surface the FE run-timeline consumes."""

import json

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.billing.entitlements import check_entitlement
from gigsnano_api.billing.metering import meter
from gigsnano_api.billing.subscriptions import get_or_create_subscription
from gigsnano_api.core.db import get_db
from gigsnano_api.features.agent_runs import service
from gigsnano_api.features.agent_runs.live import run_agent_run_in_fresh_session
from gigsnano_api.features.agent_runs.resources import (
    PersonaAtCapacity,
    agent_resources,
    assert_persona_capacity,
)
from gigsnano_api.features.agent_runs.schemas import (
    AgentResourceOut,
    AgentRunOut,
    AgentRunStepOut,
    CandidateOut,
    GigStateOut,
    RoutingOut,
)
from gigsnano_api.features.skills.launcher import completion_gate
from gigsnano_api.features.task_router.coordinator import coordinate
from gigsnano_api.features.task_router.matcher import match_candidates
from gigsnano_api.features.task_router.resolver import resolve_execution_profile
from gigsnano_api.features.task_router.selector import route_task
from gigsnano_api.marketplace.deps import (
    StoryRouteAccess,
    billing_workspace_id,
    require_story_route_access,
)
from gigsnano_api.models import Contract, EContractStatus, MarketplaceListing
from gigsnano_api.models.agent_runs import AgentRun, AgentRunStep, EAgentAutonomy, EAgentRunState
from gigsnano_api.shared.context import WorkspaceContext, get_workspace_context


class CreateRunPayload(BaseModel):
    persona_id: str | None = None  # defaults to the story's assigned ai_agent_id
    autonomy: str = "draft"


class CoordinatePayload(BaseModel):
    autonomy: str = "draft"

router = APIRouter(tags=["agent-runs"])
_B = "/workspaces/{workspace_slug}/projects/{project_id}/stories/{story_id}/runs"


@router.get("/workspaces/{workspace_slug}/agent-resources/", response_model=list[AgentResourceOut])
async def list_agent_resources(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    """Personas as assignable resources with capacity, live load, skills, cost."""
    return await agent_resources(db, ctx.workspace.id)


async def _steps(db: AsyncSession, run_id: str) -> list[AgentRunStep]:
    return list(
        (
            await db.execute(
                select(AgentRunStep).where(AgentRunStep.run_id == run_id).order_by(AgentRunStep.seq)
            )
        ).scalars().all()
    )


def _step_out(s: AgentRunStep) -> AgentRunStepOut:
    return AgentRunStepOut(
        id=s.id, seq=s.seq, kind=s.kind.value, status=s.status, summary=s.summary,
        payload=s.payload, tokens=s.tokens, created_at=s.created_at,
    )


async def _run_out(db: AsyncSession, run: AgentRun) -> AgentRunOut:
    steps = await _steps(db, run.id)
    return AgentRunOut(
        id=run.id, story_id=run.story_id, persona_id=run.persona_id,
        autonomy=run.autonomy.value, state=run.state.value,
        cost_tokens=run.cost_tokens, cost_usd=float(run.cost_usd or 0),
        created_at=run.created_at, updated_at=run.updated_at,
        steps=[_step_out(s) for s in steps],
    )


async def _load_run(db: AsyncSession, story, run_id: str) -> AgentRun:
    run = await db.get(AgentRun, run_id)
    if run is None or run.story_id != story.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")
    return run


@router.get(_B + "/", response_model=list[AgentRunOut])
async def list_runs(
    route: StoryRouteAccess = Depends(require_story_route_access),
    db: AsyncSession = Depends(get_db),
):
    runs = (
        await db.execute(
            select(AgentRun).where(AgentRun.story_id == route.story.id).order_by(AgentRun.created_at)
        )
    ).scalars().all()
    return [await _run_out(db, r) for r in runs]


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/stories/{story_id}/route/",
    response_model=RoutingOut,
)
async def route_story(
    route: StoryRouteAccess = Depends(require_story_route_access),
    db: AsyncSession = Depends(get_db),
):
    """Intelligent Task Router (GIN-227): classify the work item and recommend a
    best-fit persona + skills with a cited rationale."""
    text = f"{route.story.title}\n{route.story.description or ''}"
    return await route_task(db, route.project.workspace_id, text)


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/stories/{story_id}/execution-profile/"
)
async def story_execution_profile(
    agent: str = "auto",
    route: StoryRouteAccess = Depends(require_story_route_access),
    db: AsyncSession = Depends(get_db),
):
    """Resolve the work item's Execution Profile (read-only): classify + pin each
    routed skill to its immutable registry version+digest. Sibling of route_story."""
    story_text = f"{route.story.title}\n{route.story.description or ''}"
    return await resolve_execution_profile(db, route.project.workspace_id, story_text, agent)


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/stories/{story_id}/completion-gate/"
)
async def story_completion_gate(
    route: StoryRouteAccess = Depends(require_story_route_access),
    db: AsyncSession = Depends(get_db),
):
    """Advisory completion gate (GIN-342): are the work item's required skills
    verified with evidence on its latest run? Read-only, never blocks — the review
    handoff surfaces a gate-failing run rather than silently completing it."""
    return await completion_gate(db, route.story, route.project.workspace_id)


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/stories/{story_id}/match/",
    response_model=list[CandidateOut],
)
async def match_story(
    route: StoryRouteAccess = Depends(require_story_route_access),
    db: AsyncSession = Depends(get_db),
):
    """Grounded talent matching (GIN-186): ranked AI-agent + human candidates."""
    return await match_candidates(db, route.project.workspace_id, route.story)


_ESCROW_STATE = {
    EContractStatus.IN_PROGRESS: "held",
    EContractStatus.DELIVERED: "in_review",
    EContractStatus.COMPLETED: "released",
    EContractStatus.CANCELLED: "refunded",
}


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/stories/{story_id}/gig/",
    response_model=GigStateOut,
)
async def story_gig_state(
    route: StoryRouteAccess = Depends(require_story_route_access),
    db: AsyncSession = Depends(get_db),
):
    """Escrow/gig state for the work item (GIN-189): funded→in_review→released."""
    listing = (
        await db.execute(
            select(MarketplaceListing).where(MarketplaceListing.story_id == route.story.id)
        )
    ).scalars().first()
    if listing is None:
        return GigStateOut(published=False, listing_id=None, escrow_state=None, amount_cents=None)
    contract = (
        await db.execute(
            select(Contract).where(Contract.listing_id == listing.id).order_by(
                Contract.created_at.desc()
            )
        )
    ).scalars().first()
    if contract is None:
        return GigStateOut(
            published=True, listing_id=listing.id, escrow_state="open", amount_cents=None
        )
    return GigStateOut(
        published=True,
        listing_id=listing.id,
        escrow_state=_ESCROW_STATE.get(contract.status),
        amount_cents=contract.bid_cents + contract.fee_cents,
    )


@router.post(
    "/workspaces/{workspace_slug}/projects/{project_id}/stories/{story_id}/coordinate/",
    response_model=AgentRunOut,
    status_code=status.HTTP_201_CREATED,
)
async def coordinate_story(
    payload: CoordinatePayload,
    background: BackgroundTasks,
    route: StoryRouteAccess = Depends(require_story_route_access),
    db: AsyncSession = Depends(get_db),
):
    """Auto-route + start a run for the best-fit persona (GIN-228)."""
    try:
        autonomy = EAgentAutonomy(payload.autonomy)
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Invalid autonomy '{payload.autonomy}'")
    ws_id = billing_workspace_id(route)
    sub = await get_or_create_subscription(db, ws_id)
    if not check_entitlement(sub.tier, "task_router"):  # auto-route is Business (GIN-234)
        raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, "Auto-route requires the Business plan.")
    await meter(db, ws_id, "agent_runs")  # a coordinate starts a run — metered + quota-enforced
    try:
        run, _routing = await coordinate(db, route.story, route.project.workspace_id, autonomy)
    except PersonaAtCapacity as e:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Persona {e} is at capacity") from None
    await db.commit()
    background.add_task(
        run_agent_run_in_fresh_session, run.id,
        user_id=route.user.id, workspace_id=billing_workspace_id(route),
    )
    return await _run_out(db, run)


@router.post(_B + "/", response_model=AgentRunOut, status_code=status.HTTP_201_CREATED)
async def create_run(
    payload: CreateRunPayload,
    background: BackgroundTasks,
    route: StoryRouteAccess = Depends(require_story_route_access),
    db: AsyncSession = Depends(get_db),
):
    """Start a run for the story's persona (GIN-180) and dispatch live execution as
    a background task (GIN-250): the persona runs against the real LLM in a fresh
    session, streaming steps + cost onto the durable run the timeline reads."""
    persona = payload.persona_id or route.story.ai_agent_id
    if not persona:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No persona assigned to this work item")
    try:
        autonomy = EAgentAutonomy(payload.autonomy)
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Invalid autonomy '{payload.autonomy}'")
    try:
        await assert_persona_capacity(db, route.project.workspace_id, persona)
    except PersonaAtCapacity:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Persona {persona} is at capacity")
    await meter(db, billing_workspace_id(route), "agent_runs")  # metered + per-plan quota (GIN-235)
    run = await service.create_run(
        db, story_id=route.story.id, persona_id=persona, autonomy=autonomy
    )
    await db.commit()
    background.add_task(
        run_agent_run_in_fresh_session, run.id,
        user_id=route.user.id, workspace_id=billing_workspace_id(route),
    )
    return await _run_out(db, run)


@router.post(_B + "/{run_id}/retry/", response_model=AgentRunOut)
async def retry_run(
    run_id: str,
    route: StoryRouteAccess = Depends(require_story_route_access),
    db: AsyncSession = Depends(get_db),
):
    run = await _load_run(db, route.story, run_id)
    try:
        await service.advance_run(db, run, EAgentRunState.QUEUED)  # failed/stopped -> queued
    except ValueError:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Cannot retry a run in {run.state.value}"
        ) from None
    await db.commit()
    return await _run_out(db, run)


@router.post(_B + "/{run_id}/approve/", response_model=AgentRunOut)
async def approve_run(
    run_id: str,
    route: StoryRouteAccess = Depends(require_story_route_access),
    db: AsyncSession = Depends(get_db),
):
    """Approval checkpoint (GIN-181): accept an awaiting-review run -> done."""
    run = await _load_run(db, route.story, run_id)
    try:
        await service.advance_run(db, run, EAgentRunState.DONE)
    except ValueError:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Cannot approve a run in {run.state.value}"
        ) from None
    await db.commit()
    return await _run_out(db, run)


@router.post(_B + "/{run_id}/reject/", response_model=AgentRunOut)
async def reject_run(
    run_id: str,
    route: StoryRouteAccess = Depends(require_story_route_access),
    db: AsyncSession = Depends(get_db),
):
    """Approval checkpoint (GIN-181): reject an awaiting-review run -> back to executing (rework)."""
    run = await _load_run(db, route.story, run_id)
    try:
        await service.advance_run(db, run, EAgentRunState.EXECUTING)
    except ValueError:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Cannot reject a run in {run.state.value}"
        ) from None
    await db.commit()
    return await _run_out(db, run)


@router.get(_B + "/{run_id}/", response_model=AgentRunOut)
async def get_run(
    run_id: str,
    route: StoryRouteAccess = Depends(require_story_route_access),
    db: AsyncSession = Depends(get_db),
):
    return await _run_out(db, await _load_run(db, route.story, run_id))


@router.get(_B + "/{run_id}/stream/")
async def stream_run(
    run_id: str,
    route: StoryRouteAccess = Depends(require_story_route_access),
    db: AsyncSession = Depends(get_db),
):
    run = await _load_run(db, route.story, run_id)
    steps = await _steps(db, run.id)

    async def gen():
        for s in steps:
            yield "data: " + json.dumps({
                "seq": s.seq, "kind": s.kind.value, "status": s.status,
                "summary": s.summary, "tokens": s.tokens,
            }) + "\n\n"
        yield "event: state\ndata: " + json.dumps({
            "state": run.state.value, "cost_tokens": run.cost_tokens,
        }) + "\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")
