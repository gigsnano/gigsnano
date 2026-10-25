"""Static BMAD v6 agent roster — mirrors the frontend src/constants/bmad-agents.ts.
Not derivable from the backend BMAD manifest (skill_id/phase/description and the
3-agents-share-Amelia grouping have no source there), so it is hardcoded."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import get_db
from gigsnano_api.features.agents import service as S
from gigsnano_api.features.agents.schemas import (
    AgentOut,
    BundleOut,
    CreateAgentPayload,
    UpdateAgentPayload,
)
from gigsnano_api.features.bmad_shared.schemas import BmadAgentOut
from gigsnano_api.models import Agent
from gigsnano_api.shared.context import ADMINS, WorkspaceContext, get_workspace_context

router = APIRouter(tags=["agents"])

BMAD_AGENTS: list[dict] = [
    {"id": "agent_analyst", "name": "Analyst", "persona": "Mary",
     "skill_id": "bmad-agent-analyst", "phase": "Analysis",
     "description": "Explores the problem space — brainstorming, research, product brief, and brownfield documentation.",
     "workflows": ["bmad-brainstorming", "bmad-research", "bmad-product-brief", "bmad-document-project"]},
    {"id": "agent_pm", "name": "Product Manager", "persona": "John",
     "skill_id": "bmad-agent-pm", "phase": "Planning",
     "description": "Defines what to build — PRD, epics, stories, and scope corrections.",
     "workflows": ["bmad-prd", "bmad-create-epics-and-stories", "bmad-correct-course"]},
    {"id": "agent_architect", "name": "Architect", "persona": "Winston",
     "skill_id": "bmad-agent-architect", "phase": "Solutioning",
     "description": "Makes technical decisions explicit and runs the implementation-readiness gate.",
     "workflows": ["bmad-create-architecture", "bmad-check-implementation-readiness"]},
    {"id": "agent_ux", "name": "UI/UX Architect", "persona": "Sally",
     "skill_id": "bmad-agent-ux-designer", "phase": "Planning",
     "description": "Designs visual and behavioral UX when the product has a UI.",
     "workflows": ["bmad-ux"]},
    {"id": "agent_sm", "name": "Scrum Master", "persona": "Amelia",
     "skill_id": "bmad-agent-dev", "phase": "Implementation",
     "description": "Sequences the dev cycle — sprint planning and retrospectives (DEV-owned in BMAD v6).",
     "workflows": ["bmad-sprint-planning", "bmad-retrospective"]},
    {"id": "agent_dev", "name": "Developer", "persona": "Amelia",
     "skill_id": "bmad-agent-dev", "phase": "Implementation",
     "description": "Build engine — story implementation, code review, and quick dev flows.",
     "workflows": ["bmad-create-story", "bmad-dev-story", "bmad-code-review", "bmad-quick-dev"]},
    {"id": "agent_qa", "name": "Test Engineer", "persona": "Amelia",
     "skill_id": "bmad-agent-dev", "phase": "Implementation",
     "description": "Generates E2E tests via the Developer agent's QA workflow.",
     "workflows": ["bmad-qa-generate-e2e-tests"]},
]


@router.get("/workspaces/{workspace_slug}/agents/bmad/", response_model=list[BmadAgentOut],
            dependencies=[Depends(get_workspace_context)])
async def list_bmad_agent_templates():
    """The static BMAD v6 role/workflow metadata (moved off `/agents/` in Task 2,
    which repoints that path at the real per-workspace roster below — same path,
    same method as this used to occupy, so both can't coexist there)."""
    return [BmadAgentOut(**a) for a in BMAD_AGENTS]


_W = "/workspaces/{workspace_slug}"


def _out(a: Agent, slug: str) -> AgentOut:
    return AgentOut(
        id=a.id, workspace_slug=slug, project_id=a.project_id, name=a.name,
        persona=a.persona, domain=a.domain, avatar_color=a.avatar_color,
        voice_id=a.voice_id, instructions=a.instructions, bundles=list(a.bundles or []),
        is_builtin=a.is_builtin, enabled=a.enabled,
    )


async def _agent_or_404(db: AsyncSession, ctx: WorkspaceContext, agent_id: str) -> Agent:
    agent = await S.get_agent(db, ctx.workspace.id, agent_id)
    if agent is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Agent not found")
    return agent


def _require_admin(ctx: WorkspaceContext) -> None:
    """Composing an agent widens what voice can reach within the reviewed surface,
    so it is an admin act — a member must not be able to mint one for themselves."""
    if ctx.role not in ADMINS:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only workspace admins manage agents")


async def _commit_or_conflict(db: AsyncSession) -> None:
    """`S.name_taken` is a fast-path check, not the guarantee — two concurrent
    requests can both pass it before either commits, so the DB's
    `uq_agent_ws_name` constraint is the real gate. Without this, that race
    surfaces as an unhandled IntegrityError -> 500 instead of the 409 the
    pre-check already promises for the non-racing case."""
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "An agent with that name already exists"
        ) from exc


@router.get(f"{_W}/agents/", response_model=list[AgentOut])
async def list_workspace_agents(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    return [_out(a, ctx.workspace.slug) for a in await S.list_agents(db, ctx.workspace.id)]


@router.get(f"{_W}/agents/bundles/", response_model=list[BundleOut])
async def list_bundles(ctx: WorkspaceContext = Depends(get_workspace_context)):
    """The builder UI's checkbox list. Static, but workspace-scoped so it can
    become plan-dependent later without a client change. Must stay registered
    before `/agents/{agent_id}/` or FastAPI parses "bundles" as an agent id.

    Imported lazily: `bundles.py` -> `work_items.py` ->
    `features/stories/service.py` -> this module (for BMAD_AGENTS) at module
    scope would be circular.
    """
    from gigsnano_api.agent.tools.bundles import BUNDLES

    return [
        BundleOut(key=b.key, label=b.label, description=b.description, tool_count=len(b.tools))
        for b in BUNDLES.values()
    ]


@router.get(f"{_W}/agents/{{agent_id}}/", response_model=AgentOut)
async def get_workspace_agent(
    agent_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    return _out(await _agent_or_404(db, ctx, agent_id), ctx.workspace.slug)


@router.post(f"{_W}/agents/", response_model=AgentOut, status_code=status.HTTP_201_CREATED)
async def create_agent(
    payload: CreateAgentPayload,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(ctx)
    if await S.name_taken(db, ctx.workspace.id, payload.name):
        raise HTTPException(status.HTTP_409_CONFLICT, "An agent with that name already exists")
    if payload.project_id and not await S.project_in_workspace(db, ctx.workspace.id, payload.project_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    agent = Agent(
        workspace_id=ctx.workspace.id, created_by=ctx.user.id, **payload.model_dump()
    )
    db.add(agent)
    await _commit_or_conflict(db)
    await db.refresh(agent)
    return _out(agent, ctx.workspace.slug)


@router.patch(f"{_W}/agents/{{agent_id}}/", response_model=AgentOut)
async def update_agent(
    agent_id: str,
    payload: UpdateAgentPayload,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(ctx)
    agent = await _agent_or_404(db, ctx, agent_id)
    changes = payload.model_dump(exclude_unset=True)
    if "name" in changes and await S.name_taken(db, ctx.workspace.id, changes["name"], agent.id):
        raise HTTPException(status.HTTP_409_CONFLICT, "An agent with that name already exists")
    for key, value in changes.items():
        setattr(agent, key, value)
    await _commit_or_conflict(db)
    await db.refresh(agent)
    return _out(agent, ctx.workspace.slug)


@router.delete(f"{_W}/agents/{{agent_id}}/", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent(
    agent_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(ctx)
    agent = await _agent_or_404(db, ctx, agent_id)
    if agent.is_builtin:
        # The BMAD board depends on this roster; removing a builtin is not a
        # recoverable action. Disabling is the reversible equivalent.
        raise HTTPException(status.HTTP_409_CONFLICT, "Built-in agents can be disabled, not deleted")
    await db.delete(agent)
    await db.commit()
