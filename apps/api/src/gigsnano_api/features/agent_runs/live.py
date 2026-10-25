"""Live background execution of a persona-owned agent run (GIN-250).

The seam that turns the durable run record into real work: dispatch the assigned
persona against the real LLM in a fresh DB session (mirroring
`run_index_in_fresh_session`), stream through the existing `orchestrate`, and roll
cost onto both the run and the metering wallet. Never raises — `orchestrate`
lands a failure in FAILED and the final commit is best-effort, matching the
background-job contract.

Read-only by design: the belt tools are grounding (repo/doc reads); any mutating
tool the model reaches for gates via `AgentToolConfirm` → `awaiting_review` (the
run holds no approved tool ids), so an autopilot run can never silently write.
"""

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.agent.runner import run_agent
from gigsnano_api.agent.situation import build_situation
from gigsnano_api.agent.tools.base import ToolContext
from gigsnano_api.agent.tools.belt import build_repo_context_registry
from gigsnano_api.agent.tools.instructions import REPO_CONTEXT_INSTRUCTION
from gigsnano_api.auth.models import User
from gigsnano_api.bmad.prompt import CACHE
from gigsnano_api.bmad.provider import FakeProvider, build_default_provider
from gigsnano_api.core.config import settings
from gigsnano_api.core.db import async_session
from gigsnano_api.features.agent_runs import service
from gigsnano_api.features.agent_runs.orchestrator import orchestrate
from gigsnano_api.features.agents.router import BMAD_AGENTS
from gigsnano_api.llm.usage import record_llm_usage
from gigsnano_api.models import ELlmUsageOperation, ELlmUsageSource, Workspace
from gigsnano_api.models.agent_runs import AgentRun, EAgentRunState
from gigsnano_api.models.projects import Project
from gigsnano_api.models.stories import Story

logger = logging.getLogger(__name__)

_PERSONA = {a["id"]: a for a in BMAD_AGENTS}


def _persona_system(persona_id: str, story: Story, project_id: str, situation: str) -> list[dict]:
    a = _PERSONA.get(persona_id, {})
    name = a.get("name", "Delivery Agent")
    who = a.get("persona", "")
    desc = a.get("description", "")
    persona = f"You are {name}" + (f" ({who})" if who else "") + ", a specialist AI delivery agent on GigsNano."
    return [
        {"type": "text", "text": f"{persona}\n{desc}", **CACHE},
        {
            "type": "text",
            "text": (
                "You have been assigned this work item:\n"
                f'<work-item title="{story.title}">\n'
                f"{story.description or '(no description)'}\n</work-item>\n\n"
                "Plan the work, use your read-only tools to ground yourself in the "
                "connected codebase and project docs, then produce one concise "
                "deliverable — a plan, analysis, or draft the reviewer can act on. "
                "Do not modify data; if a change is needed, describe it for review.\n\n"
                f"{situation}\n\n{REPO_CONTEXT_INSTRUCTION}\n\n"
                f"The connected project's id is {project_id}; pass it as project_id to repo tools."
            ),
            **CACHE,
        },
    ]


async def run_agent_run_in_fresh_session(run_id: str, *, user_id: str, workspace_id: str) -> None:
    """Execute a queued run to completion in a background task. Idempotent: a run
    not still QUEUED (already picked up, or reaped) is skipped."""
    async with async_session() as db:
        run = await db.get(AgentRun, run_id)
        if run is None or run.state != EAgentRunState.QUEUED:
            return
        story = await db.get(Story, run.story_id)
        project = await db.get(Project, story.project_id) if story else None
        workspace = await db.get(Workspace, project.workspace_id) if project else None
        if story is None or project is None or workspace is None:
            await service.advance_run(db, run, EAgentRunState.FAILED)
            await db.commit()
            return

        provider = build_default_provider()
        is_fake = isinstance(provider, FakeProvider)
        model = "fake" if is_fake else settings.anthropic_model
        situation = await build_situation(db, workspace, project.id, surface="agent_run")
        system = _persona_system(run.persona_id, story, project.id, situation)
        registry = build_repo_context_registry()
        user = await db.get(User, user_id)
        ctx = ToolContext(db=db, workspace=workspace, user=user, role="member", project_id=project.id)

        async def on_usage(input_tokens: int | None, output_tokens: int | None) -> None:
            await service.record_run_cost(
                db, run, model=model, input_tokens=input_tokens,
                output_tokens=output_tokens, is_fake=is_fake,
            )
            await record_llm_usage(
                db, workspace_id=workspace_id, user_id=user_id,
                source=ELlmUsageSource.AGENT_RUN, operation=ELlmUsageOperation.STREAM_TURN,
                model=model, input_tokens=input_tokens, output_tokens=output_tokens,
                project_id=project.id, story_id=story.id, is_fake=is_fake,
            )

        events = run_agent(
            provider,
            system=system,
            messages=[{"role": "user", "content": "Begin working this item. Ground yourself, then deliver."}],
            registry=registry,
            ctx=ctx,
            on_usage=on_usage,
        )
        await orchestrate(db, run, events)  # never raises; lands DONE/AWAITING_REVIEW/FAILED
        try:
            await db.commit()
        except Exception:  # noqa: BLE001 - last-write best effort, never raise out of a bg job
            logger.exception("agent run %s final commit failed", run_id)


async def reap_interrupted_runs(db: AsyncSession) -> int:
    """Fail runs stuck mid-execution at startup. Call once at boot.

    A run executes as a BackgroundTask and cannot outlive the process, so any row
    in PLANNING/EXECUTING at boot has a dead writer with no way to ever resolve.
    QUEUED is re-dispatchable and AWAITING_REVIEW is human-gated, so both are left
    alone; only the actively-writing states are orphaned.
    """
    from sqlalchemy import select

    rows = (
        await db.execute(
            select(AgentRun).where(
                AgentRun.state.in_([EAgentRunState.PLANNING, EAgentRunState.EXECUTING])
            )
        )
    ).scalars().all()
    for run in rows:
        run.state = EAgentRunState.FAILED
    if rows:
        await db.commit()
        logger.warning("reaped %d agent run(s) interrupted by restart", len(rows))
    return len(rows)
