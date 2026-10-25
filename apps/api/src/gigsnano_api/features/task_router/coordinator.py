"""Coordination engine (GIN-228): route a task to the best-fit persona, start an
agent run applying that persona + skills, and drive it toward done — reusing the
router (GIN-227) + the run engine (GIN-177). The routing decision is recorded as
the run's opening step so the applied persona/skills are auditable.

ponytail: single-run coordination for now; cross-persona multi-step handoff (a
chain of runs, e.g. Analyst → Architect → Dev) is the named ceiling."""

from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.features.agent_runs import service
from gigsnano_api.features.agent_runs.resources import assert_persona_capacity
from gigsnano_api.features.task_router.selector import route_task
from gigsnano_api.models.agent_runs import AgentRun, EAgentAutonomy, EAgentRunStepKind


async def coordinate(
    db: AsyncSession,
    story,
    workspace_id: str,
    autonomy: EAgentAutonomy = EAgentAutonomy.DRAFT,
) -> tuple[AgentRun, dict]:
    """Route the story, start a capacity-checked run for the chosen persona, and
    record the routing decision. Raises PersonaAtCapacity if the persona is full."""
    text = f"{story.title}\n{story.description or ''}"
    routing = await route_task(db, workspace_id, text)

    await assert_persona_capacity(db, workspace_id, routing["persona_id"])  # PersonaAtCapacity
    run = await service.create_run(
        db, story_id=story.id, persona_id=routing["persona_id"], autonomy=autonomy
    )
    await service.add_step(
        db,
        run,
        kind=EAgentRunStepKind.NOTE,
        summary=f"Routed: {routing['rationale']}",
        payload={
            "persona": routing["persona_id"],
            "skills": routing["skills"],
            "domain": routing["domain"],
            "task_type": routing["task_type"],
            "confidence": routing["confidence"],
        },
    )
    return run, routing
