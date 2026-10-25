"""Roster reads and writes. No HTTP concerns — the router owns status codes."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.models import Agent, Project

# Colours previously hardcoded in features/experts/registry.py, moved to migration
# 7d1634bd7228 as the single roster seed. Duplicated here (not imported from the
# migration module — migrations aren't meant to be imported at runtime) so a
# workspace created after that migration gets the same builtin roster.
_BUILTIN_COLORS: dict[str, str] = {
    "agent_analyst": "#3b6ea5", "agent_pm": "#7c5cbf", "agent_architect": "#c2792e",
    "agent_ux": "#c2559b", "agent_sm": "#3f9a6a", "agent_dev": "#2f8a8a",
    "agent_qa": "#a24b4b",
}


async def list_agents(db: AsyncSession, workspace_id: str) -> list[Agent]:
    rows = (
        await db.execute(
            select(Agent)
            .where(Agent.workspace_id == workspace_id)
            .order_by(Agent.is_builtin.desc(), Agent.name)
        )
    ).scalars()
    return list(rows.all())


async def get_agent(db: AsyncSession, workspace_id: str, agent_id: str) -> Agent | None:
    agent = await db.get(Agent, agent_id)
    return agent if agent is not None and agent.workspace_id == workspace_id else None


async def name_taken(db: AsyncSession, workspace_id: str, name: str, exclude_id: str = "") -> bool:
    stmt = select(Agent.id).where(Agent.workspace_id == workspace_id, Agent.name == name)
    if exclude_id:
        stmt = stmt.where(Agent.id != exclude_id)
    return (await db.execute(stmt)).first() is not None


async def project_in_workspace(db: AsyncSession, workspace_id: str, project_id: str) -> bool:
    """True if `project_id` exists and belongs to `workspace_id`. The FK alone
    only guards against a dangling id, not one that points at a real project in
    someone else's workspace — pinning an agent there would leak it cross-tenant."""
    project = await db.get(Project, project_id)
    return project is not None and project.workspace_id == workspace_id


async def seed_builtin_agents(db: AsyncSession, workspace_id: str) -> None:
    """Give a newly created workspace its builtin BMAD roster. Idempotent.

    Migration 7d1634bd7228 seeded every workspace that existed at deploy time;
    it cannot reach workspaces created afterward, so workspace creation calls
    this to keep the same guarantee (a fresh workspace always has the 7 BMAD
    agents as `is_builtin=True` rows) going forward.

    The actual constraint a re-seed can hit is `uq_agent_ws_name` (workspace_id,
    name), so that is what's checked before inserting — a name already present
    (whatever seeded it: this function before, or the migration) is skipped
    rather than re-added. New rows still get a deterministic id,
    `uuid5(NAMESPACE_OID, "{ws}:{builtin_id}")` — the same scheme migration
    7d1634bd7228 uses — so a retry within the same uncommitted seed recomputes
    the identical id per builtin agent too, not just a name match. Safe today
    because the single call site (`workspaces/router.py`) is guarded by
    workspace-slug uniqueness — this is what keeps it safe if that ever changes.
    """
    from gigsnano_api.features.agents.router import BMAD_AGENTS

    existing_names = {
        row[0]
        for row in (
            await db.execute(select(Agent.name).where(Agent.workspace_id == workspace_id))
        ).all()
    }
    for a in BMAD_AGENTS:
        if a["name"] in existing_names:
            continue
        agent_id = str(uuid.uuid5(uuid.NAMESPACE_OID, f"{workspace_id}:{a['id']}"))
        db.add(
            Agent(
                id=agent_id,
                workspace_id=workspace_id,
                name=a["name"],
                persona=a["persona"],
                domain="software",
                avatar_color=_BUILTIN_COLORS.get(a["id"], "#6b7280"),
                instructions=(
                    f"You are {a['name']} ({a['persona']}), a {a['phase']} specialist. "
                    f"{a['description']} Speak in the first person, concisely, and add "
                    "genuinely new perspective rather than repeating others."
                ),
                bundles=["work_items", "project_health", "docs_repo"],
                is_builtin=True,
                enabled=True,
            )
        )
