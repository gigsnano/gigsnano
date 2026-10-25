"""Persistence helpers for agent runs (GIN-249). Orchestration (actually driving
a run through run_agent) is GIN-250; this is create/step/advance over the durable
record, with the guarded state machine enforcing legal transitions."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.features.agent_runs.lifecycle import assert_transition
from gigsnano_api.llm.pricing import estimate_cost_usd
from gigsnano_api.models.agent_runs import (
    AgentRun,
    AgentRunStep,
    EAgentAutonomy,
    EAgentRunState,
    EAgentRunStepKind,
)


async def create_run(
    db: AsyncSession,
    *,
    story_id: str,
    persona_id: str,
    autonomy: EAgentAutonomy = EAgentAutonomy.DRAFT,
) -> AgentRun:
    run = AgentRun(
        story_id=story_id,
        persona_id=persona_id,
        autonomy=autonomy,
        state=EAgentRunState.QUEUED,
    )
    db.add(run)
    await db.flush()
    return run


async def advance_run(db: AsyncSession, run: AgentRun, to_state: EAgentRunState) -> AgentRun:
    assert_transition(run.state, to_state)  # ValueError on an illegal transition
    run.state = to_state
    await db.flush()
    return run


async def add_step(
    db: AsyncSession,
    run: AgentRun,
    *,
    kind: EAgentRunStepKind,
    summary: str = "",
    payload: dict | None = None,
    tokens: int = 0,
    status: str = "ok",
) -> AgentRunStep:
    seq = (
        await db.scalar(
            select(func.count()).select_from(AgentRunStep).where(AgentRunStep.run_id == run.id)
        )
    ) or 0
    step = AgentRunStep(
        run_id=run.id,
        seq=seq,
        kind=kind,
        summary=summary,
        payload=payload or {},
        tokens=tokens,
        status=status,
    )
    db.add(step)
    run.cost_tokens = (run.cost_tokens or 0) + tokens
    await db.flush()
    return step


async def record_run_cost(
    db: AsyncSession,
    run: AgentRun,
    *,
    model: str,
    input_tokens: int | None,
    output_tokens: int | None,
    is_fake: bool = False,
) -> AgentRun:
    """Roll a round's tokens + estimated USD onto the run (GIN-251). Keyless/fake
    turns cost nothing; an unpriced model adds tokens but no USD (estimate=None)."""
    tokens = (input_tokens or 0) + (output_tokens or 0)
    run.cost_tokens = (run.cost_tokens or 0) + tokens
    if not is_fake:
        cost = estimate_cost_usd(
            model, input_tokens=input_tokens or 0, output_tokens=output_tokens or 0
        )
        if cost is not None:
            run.cost_usd = (run.cost_usd or 0) + cost
    await db.flush()
    return run
