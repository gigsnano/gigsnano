"""Agent-run orchestration (GIN-250): drive a run through plan -> execute ->
handoff over an agent event stream, logging steps and honouring autonomy.

Decoupled from run_agent by design: it consumes an AsyncIterator[AgentEvent]
(the real run_agent(...) stream in production, synthetic events in tests). The
autopilot auto-approve *resume* loop — re-invoking run_agent past a confirm gate
— is owned by GIN-251 (which holds the provider/SSE/cost/replay invocation);
here, a mutating-tool confirm hands off for review regardless.
"""

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.agent.runner import (
    AgentEvent,
    AgentSignal,
    AgentText,
    AgentToolCall,
    AgentToolConfirm,
)
from gigsnano_api.features.agent_runs import service
from gigsnano_api.models.agent_runs import (
    AgentRun,
    EAgentAutonomy,
    EAgentRunState,
    EAgentRunStepKind,
)


async def orchestrate(
    db: AsyncSession, run: AgentRun, events: AsyncIterator[AgentEvent]
) -> AgentRun:
    """Drive `run` through its lifecycle from `events`. Never raises — a failure
    lands the run in FAILED with an error step (the background-job contract)."""
    try:
        await service.advance_run(db, run, EAgentRunState.PLANNING)
        await service.add_step(db, run, kind=EAgentRunStepKind.PLAN, summary="Planning the work")
        await service.advance_run(db, run, EAgentRunState.EXECUTING)

        gated = False
        final_text = ""
        async for ev in events:
            if isinstance(ev, AgentToolCall):
                await service.add_step(
                    db, run, kind=EAgentRunStepKind.TOOL, summary=ev.name,
                    payload={"input": ev.input},
                )
            elif isinstance(ev, AgentToolConfirm):
                await service.add_step(
                    db, run, kind=EAgentRunStepKind.NOTE,
                    summary=f"Awaiting approval to run {ev.name}",
                    status="awaiting_approval",
                    payload={"tool": ev.name, "tool_use_id": ev.id, "input": ev.input},
                )
                gated = True
                break
            elif isinstance(ev, AgentSignal):
                await service.add_step(
                    db, run, kind=EAgentRunStepKind.NOTE, summary=f"Signal: {ev.name}",
                    payload=ev.input,
                )
            elif isinstance(ev, AgentText):
                final_text = ev.text  # keep the latest synthesis as the artifact

        if final_text:
            await service.add_step(
                db, run, kind=EAgentRunStepKind.ARTIFACT, summary=final_text[:500],
            )

        if gated:
            # A write needs sign-off — hand off for review regardless of autonomy.
            await service.advance_run(db, run, EAgentRunState.AWAITING_REVIEW)
        else:
            # Clean finish: autopilot auto-completes; draft/suggest still await review.
            final = (
                EAgentRunState.DONE
                if run.autonomy == EAgentAutonomy.AUTOPILOT
                else EAgentRunState.AWAITING_REVIEW
            )
            await service.advance_run(db, run, final)
    except Exception as e:  # noqa: BLE001 - a run never raises out of orchestration
        try:
            await service.advance_run(db, run, EAgentRunState.FAILED)
        except ValueError:
            pass  # already terminal
        await service.add_step(
            db, run, kind=EAgentRunStepKind.NOTE, summary=f"error: {e}"[:500], status="error",
        )
    return run
