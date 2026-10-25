"""Expert roster, read from the `agents` table.

Previously a module-level dict whose docstring called `register_expert()` "the
open/closed seam" for finance and education experts. The table is that seam now,
so the dict is gone rather than kept alongside it — two rosters drift the first
time either is edited, and Expert Rooms and the contact list must agree.
"""

from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.features.agents import service as agents_service
from gigsnano_api.models import Agent


@dataclass(frozen=True)
class Expert:
    id: str
    name: str
    persona: str
    domain: str
    system_prompt: str
    avatar_color: str
    bundles: tuple[str, ...] = ()


def _to_expert(agent: Agent) -> Expert:
    return Expert(
        id=agent.id,
        name=agent.name,
        persona=agent.persona,
        domain=agent.domain,
        system_prompt=agent.instructions,
        avatar_color=agent.avatar_color,
        bundles=tuple(agent.bundles or []),
    )


async def list_experts(db: AsyncSession, workspace_id: str) -> list[Expert]:
    return [
        _to_expert(a) for a in await agents_service.list_agents(db, workspace_id) if a.enabled
    ]


async def get_expert(db: AsyncSession, workspace_id: str, expert_id: str) -> Expert | None:
    agent = await agents_service.get_agent(db, workspace_id, expert_id)
    return _to_expert(agent) if agent is not None and agent.enabled else None
