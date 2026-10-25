"""Personas as assignable resources (GIN-179): the static BMAD roster enriched
with concurrency capacity, live load (active runs), skills, and accrued cost —
so a persona can be picked and load-balanced alongside human members."""

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.features.agents.router import BMAD_AGENTS
from gigsnano_api.models.agent_runs import AgentRun, EAgentRunState
from gigsnano_api.models.projects import Project
from gigsnano_api.models.stories import Story

# ponytail: one global concurrency cap; make it per-persona config if load ever
# needs tuning per role.
PERSONA_CAPACITY = 3

_ACTIVE = (
    EAgentRunState.QUEUED,
    EAgentRunState.PLANNING,
    EAgentRunState.EXECUTING,
    EAgentRunState.AWAITING_REVIEW,
)


class PersonaAtCapacity(Exception):
    """Raised when a persona already has PERSONA_CAPACITY active runs."""


def _persona_ids() -> set[str]:
    return {a["id"] for a in BMAD_AGENTS}


async def _load_by_persona(
    db: AsyncSession, workspace_id: str, project_ids: list[str] | None = None
) -> dict[str, dict]:
    """Per-persona {active, cost_tokens, cost_usd} across the workspace's runs
    (optionally scoped to a subset of projects — e.g. a teamspace, GIN-245)."""
    active_case = func.sum(case((AgentRun.state.in_(_ACTIVE), 1), else_=0))
    stmt = (
        select(
            AgentRun.persona_id,
            active_case.label("active"),
            func.coalesce(func.sum(AgentRun.cost_tokens), 0).label("cost_tokens"),
            func.coalesce(func.sum(AgentRun.cost_usd), 0).label("cost_usd"),
        )
        .join(Story, Story.id == AgentRun.story_id)
        .join(Project, Project.id == Story.project_id)
        .where(Project.workspace_id == workspace_id)
        .group_by(AgentRun.persona_id)
    )
    if project_ids is not None:
        stmt = stmt.where(Project.id.in_(project_ids))
    rows = (await db.execute(stmt)).all()
    return {
        r.persona_id: {
            "active": int(r.active or 0),
            "cost_tokens": int(r.cost_tokens or 0),
            "cost_usd": float(r.cost_usd or 0),
        }
        for r in rows
    }


async def active_run_count(db: AsyncSession, workspace_id: str, persona_id: str) -> int:
    stmt = (
        select(func.count())
        .select_from(AgentRun)
        .join(Story, Story.id == AgentRun.story_id)
        .join(Project, Project.id == Story.project_id)
        .where(
            Project.workspace_id == workspace_id,
            AgentRun.persona_id == persona_id,
            AgentRun.state.in_(_ACTIVE),
        )
    )
    return int(await db.scalar(stmt) or 0)


async def assert_persona_capacity(db: AsyncSession, workspace_id: str, persona_id: str) -> None:
    if await active_run_count(db, workspace_id, persona_id) >= PERSONA_CAPACITY:
        raise PersonaAtCapacity(persona_id)


async def agent_resources(
    db: AsyncSession, workspace_id: str, project_ids: list[str] | None = None
) -> list[dict]:
    load = await _load_by_persona(db, workspace_id, project_ids)
    out = []
    for a in BMAD_AGENTS:
        stats = load.get(a["id"], {})
        out.append({
            "id": a["id"],
            "name": a["name"],
            "persona": a["persona"],
            "phase": a["phase"],
            "skills": a["workflows"],
            "capacity": PERSONA_CAPACITY,
            "active_load": stats.get("active", 0),
            "cost_tokens": stats.get("cost_tokens", 0),
            "cost_usd": stats.get("cost_usd", 0.0),
        })
    return out
