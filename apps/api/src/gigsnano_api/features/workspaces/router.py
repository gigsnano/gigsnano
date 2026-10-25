from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.deps import get_current_user
from gigsnano_api.auth.models import User
from gigsnano_api.core.db import get_db
from gigsnano_api.features.workspaces.schemas import (
    CreateWorkspacePayload,
    UpdateWorkspacePayload,
    WorkspaceOut,
)
from gigsnano_api.models import (
    EMemberStatus,
    EWorkspaceRole,
    GitHubConnection,
    Project,
    Workspace,
    WorkspaceMember,
)
from gigsnano_api.shared.context import WorkspaceContext, get_workspace_context, require_role
from gigsnano_api.sync.router import get_connection

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


def serialize_workspace(
    workspace: Workspace,
    member_count: int,
    project_count: int,
    connection: "GitHubConnection | None" = None,
) -> WorkspaceOut:
    return WorkspaceOut(
        id=workspace.id,
        slug=workspace.slug,
        name=workspace.name,
        logo_url=workspace.logo_url,
        member_count=member_count,
        project_count=project_count,
        github_connected=connection is not None,
        github_repo_url=connection.repo_url if connection else None,
        holidays=workspace.holidays or [],
        created_at=workspace.created_at,
        updated_at=workspace.updated_at,
    )


async def _member_count(db: AsyncSession, workspace_id: str) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(WorkspaceMember)
        .where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.status == EMemberStatus.ACTIVE,
        )
    )
    return result.scalar_one()


async def _project_count(db: AsyncSession, workspace_id: str) -> int:
    result = await db.execute(
        select(func.count()).select_from(Project).where(Project.workspace_id == workspace_id)
    )
    return result.scalar_one()


@router.get("/", response_model=list[WorkspaceOut])
async def list_my_workspaces(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Workspace)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(
            WorkspaceMember.user_id == user.id,
            WorkspaceMember.status == EMemberStatus.ACTIVE,
        )
        .order_by(Workspace.created_at)
    )
    workspaces = result.scalars().all()
    # No bulk github-connection query here: list rows showing connected=false
    # is acceptable until this is a real perf hotspot (see get_workspace below).
    return [
        serialize_workspace(
            w, await _member_count(db, w.id), await _project_count(db, w.id)
        )
        for w in workspaces
    ]


@router.post("/", response_model=WorkspaceOut, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    payload: CreateWorkspacePayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(Workspace).where(Workspace.slug == payload.slug))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Slug already taken")
    workspace = Workspace(name=payload.name, slug=payload.slug)
    db.add(workspace)
    await db.flush()
    db.add(
        WorkspaceMember(
            workspace_id=workspace.id, user_id=user.id, role=EWorkspaceRole.OWNER
        )
    )
    # Every workspace gets the builtin BMAD roster (migration 7d1634bd7228 seeded
    # workspaces that existed at deploy time; this covers ones created after).
    from gigsnano_api.features.agents.service import seed_builtin_agents

    await seed_builtin_agents(db, workspace.id)
    user.last_workspace_slug = workspace.slug
    await db.commit()
    return serialize_workspace(workspace, member_count=1, project_count=0)


@router.get("/{workspace_slug}/", response_model=WorkspaceOut)
async def get_workspace(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    return serialize_workspace(
        ctx.workspace,
        await _member_count(db, ctx.workspace.id),
        await _project_count(db, ctx.workspace.id),
        await get_connection(db, ctx.workspace.id),
    )


@router.patch("/{workspace_slug}/", response_model=WorkspaceOut)
async def update_workspace(
    payload: UpdateWorkspacePayload,
    ctx: WorkspaceContext = Depends(require_role(EWorkspaceRole.ADMIN, EWorkspaceRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    if payload.name is not None:
        ctx.workspace.name = payload.name
    if payload.holidays is not None:
        # Stored as plain JSON, already deduped and sorted by the payload
        # validator, so every reader gets one entry per date in order.
        ctx.workspace.holidays = [
            {"date": h.date.isoformat(), "name": h.name} for h in payload.holidays
        ]
    await db.commit()
    return serialize_workspace(
        ctx.workspace,
        await _member_count(db, ctx.workspace.id),
        await _project_count(db, ctx.workspace.id),
        await get_connection(db, ctx.workspace.id),
    )
