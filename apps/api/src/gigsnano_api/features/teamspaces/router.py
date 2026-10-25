"""Teamspaces HTTP surface (GIN-245): CRUD + membership/project sets, a
cross-project rollup, and an overview aggregating the team's projects, hybrid
human+agent workload, and pinned roster. Create is entitlement-gated (Pro)."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.billing.entitlements import require_entitlement
from gigsnano_api.core.db import get_db
from gigsnano_api.features.agent_runs.resources import agent_resources
from gigsnano_api.features.foundation.artifacts import assert_pins_visible, list_visible
from gigsnano_api.features.teamspaces import service as S
from gigsnano_api.features.teamspaces.schemas import (
    RollupOut,
    SetIdsIn,
    TeamspaceIn,
    TeamspaceOut,
    TeamspacePatch,
)
from gigsnano_api.models import Project
from gigsnano_api.models.teamspaces import Teamspace
from gigsnano_api.shared.context import (
    WorkspaceContext,
    accessible_project_ids,
    get_workspace_context,
)
from gigsnano_api.shared.serializers import serialize_projects

router = APIRouter(tags=["teamspaces"])
_W = "/workspaces/{workspace_slug}"


async def _out(db, t: Teamspace) -> TeamspaceOut:
    return TeamspaceOut(
        id=t.id, workspace_id=t.workspace_id, name=t.name, description=t.description,
        pinned_artifacts=t.pinned_artifacts,
        member_ids=await S.member_ids(db, t.id), project_ids=await S.project_ids(db, t.id),
        created_at=t.created_at,
    )


async def _own(db, teamspace_id, ctx) -> Teamspace:
    t = await db.get(Teamspace, teamspace_id)
    if t is None or t.workspace_id != ctx.workspace.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Teamspace not found")
    return t


@router.get(f"{_W}/teamspaces/", response_model=list[TeamspaceOut])
async def list_teamspaces(
    ctx: WorkspaceContext = Depends(get_workspace_context), db: AsyncSession = Depends(get_db)
):
    rows = (await db.execute(
        select(Teamspace).where(Teamspace.workspace_id == ctx.workspace.id).order_by(Teamspace.name)
    )).scalars().all()
    return [await _out(db, t) for t in rows]


@router.post(f"{_W}/teamspaces/", response_model=TeamspaceOut, status_code=status.HTTP_201_CREATED)
async def create_teamspace(
    payload: TeamspaceIn,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    _ent: WorkspaceContext = Depends(require_entitlement("teamspaces")),
    db: AsyncSession = Depends(get_db),
):
    try:
        await assert_pins_visible(db, ctx.workspace.id, payload.pinned_artifacts)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from None
    t = Teamspace(workspace_id=ctx.workspace.id, name=payload.name,
                  description=payload.description, pinned_artifacts=payload.pinned_artifacts)
    db.add(t)
    await db.flush()
    await S.set_members(db, t.id, payload.member_ids)
    await S.set_projects(db, t.id, payload.project_ids)
    await db.commit()
    return await _out(db, t)


@router.patch(f"{_W}/teamspaces/{{teamspace_id}}/", response_model=TeamspaceOut)
async def update_teamspace(
    teamspace_id: str, payload: TeamspacePatch,
    ctx: WorkspaceContext = Depends(get_workspace_context), db: AsyncSession = Depends(get_db),
):
    t = await _own(db, teamspace_id, ctx)
    if payload.name is not None:
        t.name = payload.name
    if payload.description is not None:
        t.description = payload.description
    if payload.pinned_artifacts is not None:
        try:
            await assert_pins_visible(db, ctx.workspace.id, payload.pinned_artifacts)
        except ValueError as e:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from None
        t.pinned_artifacts = payload.pinned_artifacts
    await db.commit()
    return await _out(db, t)


@router.delete(f"{_W}/teamspaces/{{teamspace_id}}/")
async def delete_teamspace(
    teamspace_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context), db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    t = await _own(db, teamspace_id, ctx)
    await db.delete(t)
    await db.commit()
    return {"success": True}


@router.put(f"{_W}/teamspaces/{{teamspace_id}}/members/", response_model=TeamspaceOut)
async def set_members(
    teamspace_id: str, payload: SetIdsIn,
    ctx: WorkspaceContext = Depends(get_workspace_context), db: AsyncSession = Depends(get_db),
):
    t = await _own(db, teamspace_id, ctx)
    await S.set_members(db, t.id, payload.ids)
    await db.commit()
    return await _out(db, t)


@router.put(f"{_W}/teamspaces/{{teamspace_id}}/projects/", response_model=TeamspaceOut)
async def set_projects(
    teamspace_id: str, payload: SetIdsIn,
    ctx: WorkspaceContext = Depends(get_workspace_context), db: AsyncSession = Depends(get_db),
):
    t = await _own(db, teamspace_id, ctx)
    # Only accept projects in this workspace.
    valid = (await db.execute(
        select(Project.id).where(Project.workspace_id == ctx.workspace.id, Project.id.in_(payload.ids))
    )).scalars().all()
    await S.set_projects(db, t.id, list(valid))
    await db.commit()
    return await _out(db, t)


@router.get(f"{_W}/teamspaces/{{teamspace_id}}/rollup/", response_model=RollupOut)
async def teamspace_rollup(
    teamspace_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context), db: AsyncSession = Depends(get_db),
):
    t = await _own(db, teamspace_id, ctx)
    accessible = await accessible_project_ids(db, ctx)
    pids = S._visible(await S.project_ids(db, t.id), accessible)
    return RollupOut(**await S.rollup(db, pids))


@router.get(f"{_W}/teamspaces/{{teamspace_id}}/overview/")
async def teamspace_overview(
    teamspace_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context), db: AsyncSession = Depends(get_db),
) -> dict:
    """The team's projects + hybrid workload + rollup + pinned roster (GIN-244)."""
    t = await _own(db, teamspace_id, ctx)
    accessible = await accessible_project_ids(db, ctx)
    pids = S._visible(await S.project_ids(db, t.id), accessible)

    projects = (await db.execute(select(Project).where(Project.id.in_(pids)))).scalars().all() if pids else []
    roster = [a for a in await list_visible(db, ctx.workspace.id) if a["id"] in set(t.pinned_artifacts)]
    return {
        "projects": await serialize_projects(db, list(projects), ctx.workspace.slug),
        "rollup": await S.rollup(db, pids),
        "human_workload": await S.human_workload(db, pids),
        "agent_workload": await agent_resources(db, ctx.workspace.id, project_ids=pids),
        "pinned_roster": roster,
    }
