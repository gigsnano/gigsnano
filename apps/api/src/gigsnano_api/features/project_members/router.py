from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from gigsnano_api.auth.models import User
from gigsnano_api.core.db import get_db
from gigsnano_api.email.deps import get_email_provider
from gigsnano_api.email.provider import EmailProvider
from gigsnano_api.features.notifications.router import resolve_and_notify
from gigsnano_api.features.project_members.schemas import AddProjectMemberPayload, ProjectMemberOut
from gigsnano_api.features.projects.router import record_activity
from gigsnano_api.models import (
    EMemberStatus,
    ENotificationKind,
    EProjectActivityType,
    EProjectRole,
    Project,
    ProjectMember,
    WorkspaceMember,
)
from gigsnano_api.shared.context import (
    WorkspaceContext,
    get_project_or_404,
    get_workspace_context,
    project_role_of,
    require_project_permission,
)
from gigsnano_api.shared.project_rbac import (
    ROLE_RANK,
    WORKSPACE_GOVERNANCE_ROLES,
    EProjectPermission,
)

router = APIRouter(tags=["project-members"])


class UpdateProjectMemberPayload(BaseModel):
    role: EProjectRole


class TransferOwnershipPayload(BaseModel):
    new_owner_user_id: str


async def _owner_count(db: AsyncSession, project_id: str) -> int:
    """Active OWNER memberships on the project — the last-owner guard reads this."""
    rows = await db.execute(
        select(ProjectMember.id).where(
            ProjectMember.project_id == project_id,
            ProjectMember.role == EProjectRole.OWNER,
            ProjectMember.status == EMemberStatus.ACTIVE,
        )
    )
    return len(rows.all())


async def _effective_rank(db: AsyncSession, ctx: WorkspaceContext, project_id: str) -> int:
    """The actor's effective project rank. Workspace Owner/Admin get OWNER rank
    (governance); otherwise their project role's rank, or -1 if not a member."""
    if ctx.role in WORKSPACE_GOVERNANCE_ROLES:
        return ROLE_RANK[EProjectRole.OWNER]
    role = await project_role_of(db, ctx.user.id, project_id)
    return ROLE_RANK[role] if role is not None else -1


def _reject_grant_above_authority(actor_rank: int, target_role: EProjectRole) -> None:
    """A user cannot grant a role higher than their own authority (GIN-319)."""
    if ROLE_RANK[target_role] > actor_rank:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "You cannot grant a role higher than your own authority",
        )


def project_member_out(m: ProjectMember) -> ProjectMemberOut:
    return ProjectMemberOut(
        id=m.id,
        project_id=m.project_id,
        user_id=m.user_id,
        display_name=m.user.display_name,
        email=m.user.email,
        avatar_url=m.user.avatar_url,
        role=m.role,
        status=m.status,
    )


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/members/",
    response_model=list[ProjectMemberOut],
)
async def list_project_members(
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
):
    members = (
        await db.execute(
            select(ProjectMember)
            .options(selectinload(ProjectMember.user))
            .where(ProjectMember.project_id == project.id)
            .order_by(ProjectMember.created_at)
        )
    ).scalars()
    return [project_member_out(m) for m in members.all()]


@router.post(
    "/workspaces/{workspace_slug}/projects/{project_id}/members/",
    response_model=ProjectMemberOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_project_member(
    payload: AddProjectMemberPayload,
    background: BackgroundTasks,
    project: Project = Depends(require_project_permission(EProjectPermission.MANAGE_MEMBERS)),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
    email_provider: EmailProvider = Depends(get_email_provider),
):
    if (payload.user_id is None) == (payload.email is None):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Provide user_id or email")

    # A user cannot add someone at a role above their own authority (GIN-319).
    _reject_grant_above_authority(await _effective_rank(db, ctx, project.id), payload.role)

    if payload.user_id is not None:
        user = await db.get(User, payload.user_id)
    else:
        user = (
            await db.execute(select(User).where(User.email == payload.email))
        ).scalar_one_or_none()
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    # Workspace pool, PENDING invitees included (GIN-528) — an admin lines up
    # someone's project while the invite is out. Status is deliberately not
    # checked: `get_workspace_context` admits ACTIVE members only, so this row
    # grants nothing until they accept. Checking here blocks the assignment, never
    # the access.
    ws_member = (
        await db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == ctx.workspace.id,
                WorkspaceMember.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if ws_member is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not a member of this workspace")

    existing = (
        await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project.id, ProjectMember.user_id == user.id
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Already a project member")

    member = ProjectMember(project_id=project.id, user_id=user.id, role=payload.role)
    db.add(member)
    await db.flush()
    record_activity(
        db,
        project.id,
        EProjectActivityType.MEMBER,
        ctx.user,
        f"added {user.display_name} to the project",
    )
    if user.id != ctx.user.id:
        await resolve_and_notify(
            db,
            ctx.workspace.id,
            user.id,
            trigger_key="project.member_added",
            context={
                "actor": ctx.user.display_name,
                "project": project.name,
            },
            kind=ENotificationKind.SYSTEM,
            href=f"/{ctx.workspace.slug}/projects/{project.id}",
            triggered_by_id=ctx.user.id,
            project_id=project.id,
            background=background,
            provider=email_provider,
        )
    await db.commit()
    member.user = user
    return project_member_out(member)


@router.patch(
    "/workspaces/{workspace_slug}/projects/{project_id}/members/{member_id}/",
    response_model=ProjectMemberOut,
)
async def update_project_member(
    member_id: str,
    payload: UpdateProjectMemberPayload,
    project: Project = Depends(require_project_permission(EProjectPermission.MANAGE_MEMBERS)),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    member = (
        await db.execute(
            select(ProjectMember)
            .options(selectinload(ProjectMember.user))
            .where(ProjectMember.id == member_id, ProjectMember.project_id == project.id)
        )
    ).scalar_one_or_none()
    if member is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found")

    # Can't grant above your own authority, and the last owner can't be demoted
    # until ownership is transferred (GIN-318 invariants).
    _reject_grant_above_authority(await _effective_rank(db, ctx, project.id), payload.role)
    if (
        member.role == EProjectRole.OWNER
        and payload.role != EProjectRole.OWNER
        and await _owner_count(db, project.id) <= 1
    ):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "The last owner cannot be demoted; transfer ownership first",
        )

    member.role = payload.role
    await db.commit()
    return project_member_out(member)


@router.delete("/workspaces/{workspace_slug}/projects/{project_id}/members/{member_id}/")
async def remove_project_member(
    member_id: str,
    project: Project = Depends(require_project_permission(EProjectPermission.MANAGE_MEMBERS)),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    member = (
        await db.execute(
            select(ProjectMember).where(
                ProjectMember.id == member_id, ProjectMember.project_id == project.id
            )
        )
    ).scalar_one_or_none()
    if member is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found")
    # A project must always keep at least one owner (GIN-318).
    if member.role == EProjectRole.OWNER and await _owner_count(db, project.id) <= 1:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "The last owner cannot be removed; transfer ownership first",
        )
    await db.delete(member)
    await db.commit()
    return {"success": True}


@router.post(
    "/workspaces/{workspace_slug}/projects/{project_id}/transfer-ownership/",
    response_model=ProjectMemberOut,
)
async def transfer_ownership(
    payload: TransferOwnershipPayload,
    project: Project = Depends(require_project_permission(EProjectPermission.TRANSFER_OWNERSHIP)),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    """Atomically make another active project member the OWNER (GIN-318). Only a
    current OWNER (or workspace governance) may call this. The project never passes
    through a zero-owner state — the new owner is promoted in the same transaction,
    and the caller (if they were the sole owner) steps down to ADMIN."""
    target = (
        await db.execute(
            select(ProjectMember)
            .options(selectinload(ProjectMember.user))
            .where(
                ProjectMember.project_id == project.id,
                ProjectMember.user_id == payload.new_owner_user_id,
                ProjectMember.status == EMemberStatus.ACTIVE,
            )
        )
    ).scalar_one_or_none()
    if target is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "Target user is not an active project member"
        )

    target.role = EProjectRole.OWNER
    # Step the initiating owner down to ADMIN (only if they hold a project OWNER row;
    # a workspace-governance caller may not be a project member at all).
    caller = await _get_member(db, project.id, ctx.user.id)
    if caller is not None and caller.role == EProjectRole.OWNER and caller.id != target.id:
        caller.role = EProjectRole.ADMIN

    record_activity(
        db,
        project.id,
        EProjectActivityType.MEMBER,
        ctx.user,
        f"transferred project ownership to {target.user.display_name}",
    )
    await db.commit()
    return project_member_out(target)


async def _get_member(db: AsyncSession, project_id: str, user_id: str) -> ProjectMember | None:
    return (
        await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id, ProjectMember.user_id == user_id
            )
        )
    ).scalar_one_or_none()
