from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from gigsnano_api.admin.audit import record_audit
from gigsnano_api.admin.billing import router as billing_router
from gigsnano_api.admin.deps import StaffContext, get_staff_context, require_privilege
from gigsnano_api.admin.llm_usage import router as llm_usage_router
from gigsnano_api.admin.notification_templates import router as notification_templates_router
from gigsnano_api.admin.privileges import PRIVILEGES, is_valid_privilege
from gigsnano_api.auth.models import User
from gigsnano_api.core.db import get_db
from gigsnano_api.core.pagination import OffsetPageOut
from gigsnano_api.models import (
    AuditLog,
    ProjectMember,
    StaffMember,
    StaffRole,
    Story,
    Workspace,
    WorkspaceMember,
)

router = APIRouter(prefix="/admin", tags=["admin"])
router.include_router(llm_usage_router)
router.include_router(notification_templates_router)
router.include_router(billing_router)


class PrivilegeOut(BaseModel):
    key: str
    group: str
    label: str


class StaffMeOut(BaseModel):
    user_id: str
    display_name: str
    email: str
    avatar_url: str | None
    role_id: str
    role_name: str
    is_superadmin: bool
    privileges: list[str]


@router.get("/me/", response_model=StaffMeOut)
async def get_me(
    ctx: StaffContext = Depends(get_staff_context),
    db: AsyncSession = Depends(get_db),
):
    await record_audit(db, ctx, "admin.access")
    await db.commit()
    return StaffMeOut(
        user_id=ctx.user.id,
        display_name=ctx.user.display_name,
        email=ctx.user.email,
        avatar_url=ctx.user.avatar_url,
        role_id=ctx.role.id,
        role_name=ctx.role.name,
        is_superadmin=bool(ctx.role.is_system),
        privileges=sorted(ctx.privileges),
    )


@router.get("/privileges/", response_model=list[PrivilegeOut])
async def list_privileges(
    ctx: StaffContext = Depends(require_privilege("roles.read")),
):
    return [PrivilegeOut(key=p.key, group=p.group, label=p.label) for p in PRIVILEGES]


class RoleOut(BaseModel):
    id: str
    name: str
    description: str
    privileges: list[str]
    is_system: bool
    member_count: int
    created_at: object
    updated_at: object


class CreateRolePayload(BaseModel):
    name: str
    description: str = ""
    privileges: list[str] = []


class UpdateRolePayload(BaseModel):
    name: str | None = None
    description: str | None = None
    privileges: list[str] | None = None


def _validate_privileges(privileges: list[str]) -> None:
    unknown = [p for p in privileges if not is_valid_privilege(p)]
    if unknown:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown privilege(s): {', '.join(unknown)}"
        )


async def _member_count(db: AsyncSession, role_id: str) -> int:
    return (
        await db.execute(
            select(func.count()).select_from(StaffMember).where(StaffMember.role_id == role_id)
        )
    ).scalar() or 0


async def _role_out(db: AsyncSession, role: StaffRole) -> RoleOut:
    return RoleOut(
        id=role.id,
        name=role.name,
        description=role.description,
        privileges=sorted(role.privileges or []),
        is_system=bool(role.is_system),
        member_count=await _member_count(db, role.id),
        created_at=role.created_at,
        updated_at=role.updated_at,
    )


async def _role_or_404(db: AsyncSession, role_id: str) -> StaffRole:
    role = await db.get(StaffRole, role_id)
    if role is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Role not found")
    return role


@router.get("/roles/", response_model=list[RoleOut])
async def list_roles(
    ctx: StaffContext = Depends(require_privilege("roles.read")),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(select(StaffRole).order_by(StaffRole.name))).scalars().all()
    return [await _role_out(db, r) for r in rows]


@router.post("/roles/", response_model=RoleOut, status_code=status.HTTP_201_CREATED)
async def create_role(
    payload: CreateRolePayload,
    ctx: StaffContext = Depends(require_privilege("roles.manage")),
    db: AsyncSession = Depends(get_db),
):
    if not payload.name.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Name is required")
    _validate_privileges(payload.privileges)
    role = StaffRole(
        name=payload.name.strip(),
        description=payload.description.strip(),
        privileges=sorted(set(payload.privileges)),
        is_system=False,
    )
    db.add(role)
    await db.flush()
    await record_audit(db, ctx, "role.create", target_type="staff_role", target_id=role.id,
                       meta={"after": {"name": role.name, "privileges": role.privileges}})
    await db.commit()
    return await _role_out(db, role)


@router.patch("/roles/{role_id}/", response_model=RoleOut)
async def update_role(
    role_id: str,
    payload: UpdateRolePayload,
    ctx: StaffContext = Depends(require_privilege("roles.manage")),
    db: AsyncSession = Depends(get_db),
):
    role = await _role_or_404(db, role_id)
    if role.is_system:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "System role cannot be edited")
    before = {"name": role.name, "description": role.description, "privileges": role.privileges}
    if payload.name is not None:
        if not payload.name.strip():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Name is required")
        role.name = payload.name.strip()
    if payload.description is not None:
        role.description = payload.description.strip()
    if payload.privileges is not None:
        _validate_privileges(payload.privileges)
        role.privileges = sorted(set(payload.privileges))
    await record_audit(db, ctx, "role.update", target_type="staff_role", target_id=role.id,
                       meta={"before": before, "after": {
                           "name": role.name, "description": role.description,
                           "privileges": role.privileges}})
    await db.commit()
    return await _role_out(db, role)


@router.delete("/roles/{role_id}/", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(
    role_id: str,
    ctx: StaffContext = Depends(require_privilege("roles.manage")),
    db: AsyncSession = Depends(get_db),
):
    role = await _role_or_404(db, role_id)
    if role.is_system:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "System role cannot be deleted")
    if await _member_count(db, role.id) > 0:
        raise HTTPException(status.HTTP_409_CONFLICT, "Reassign members before deleting this role")
    await record_audit(db, ctx, "role.delete", target_type="staff_role", target_id=role.id,
                       meta={"before": {"name": role.name}})
    await db.delete(role)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


class StaffMemberOut(BaseModel):
    id: str
    user_id: str
    display_name: str
    email: str
    avatar_url: str | None
    role_id: str
    role_name: str
    is_active: bool
    created_at: object


class GrantStaffPayload(BaseModel):
    user_id: str
    role_id: str


class UpdateStaffPayload(BaseModel):
    role_id: str | None = None
    is_active: bool | None = None


def _staff_member_out(member: StaffMember) -> StaffMemberOut:
    return StaffMemberOut(
        id=member.id,
        user_id=member.user_id,
        display_name=member.user.display_name,
        email=member.user.email,
        avatar_url=member.user.avatar_url,
        role_id=member.role_id,
        role_name=member.role.name,
        is_active=member.is_active,
        created_at=member.created_at,
    )


async def _load_staff(db: AsyncSession, member_id: str) -> StaffMember:
    member = (
        await db.execute(
            select(StaffMember)
            .options(selectinload(StaffMember.user), selectinload(StaffMember.role))
            .where(StaffMember.id == member_id)
        )
    ).scalar_one_or_none()
    if member is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Staff member not found")
    return member


@router.get("/staff/", response_model=list[StaffMemberOut])
async def list_staff(
    ctx: StaffContext = Depends(require_privilege("staff.manage")),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            select(StaffMember)
            .options(selectinload(StaffMember.user), selectinload(StaffMember.role))
            .order_by(StaffMember.created_at.desc())
        )
    ).scalars().all()
    return [_staff_member_out(m) for m in rows]


@router.post("/staff/", response_model=StaffMemberOut, status_code=status.HTTP_201_CREATED)
async def grant_staff(
    payload: GrantStaffPayload,
    ctx: StaffContext = Depends(require_privilege("staff.manage")),
    db: AsyncSession = Depends(get_db),
):
    if await db.get(User, payload.user_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    target_role = await db.get(StaffRole, payload.role_id)
    if target_role is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Role not found")
    if target_role.is_system and not ctx.role.is_system:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only a superadmin can assign the system role")
    existing = (
        await db.execute(select(StaffMember).where(StaffMember.user_id == payload.user_id))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "User is already staff")
    member = StaffMember(user_id=payload.user_id, role_id=payload.role_id, is_active=True)
    db.add(member)
    await db.flush()
    await record_audit(db, ctx, "staff.grant", target_type="staff_member", target_id=member.id,
                       meta={"after": {"user_id": payload.user_id, "role_id": payload.role_id}})
    await db.commit()
    return _staff_member_out(await _load_staff(db, member.id))


@router.patch("/staff/{member_id}/", response_model=StaffMemberOut)
async def update_staff(
    member_id: str,
    payload: UpdateStaffPayload,
    ctx: StaffContext = Depends(require_privilege("staff.manage")),
    db: AsyncSession = Depends(get_db),
):
    member = await _load_staff(db, member_id)
    before = {"role_id": member.role_id, "is_active": member.is_active}
    if payload.role_id is not None:
        target_role = await db.get(StaffRole, payload.role_id)
        if target_role is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Role not found")
        if target_role.is_system and not ctx.role.is_system:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only a superadmin can assign the system role")
        member.role_id = payload.role_id
    if payload.is_active is not None:
        member.is_active = payload.is_active
    await record_audit(db, ctx, "staff.update", target_type="staff_member", target_id=member.id,
                       meta={"before": before, "after": {
                           "role_id": member.role_id, "is_active": member.is_active}})
    await db.commit()
    # member.role_id was mutated directly (not via the relationship), so the
    # already-loaded `role` relationship would otherwise stay stale on reload.
    db.expire(member, ["role"])
    return _staff_member_out(await _load_staff(db, member.id))


@router.delete("/staff/{member_id}/", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_staff(
    member_id: str,
    ctx: StaffContext = Depends(require_privilege("staff.manage")),
    db: AsyncSession = Depends(get_db),
):
    member = await _load_staff(db, member_id)
    await record_audit(db, ctx, "staff.revoke", target_type="staff_member", target_id=member.id,
                       meta={"before": {"user_id": member.user_id}})
    await db.delete(member)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


class AuditLogOut(BaseModel):
    id: str
    actor_staff_id: str | None
    actor_name: str
    action: str
    target_type: str | None
    target_id: str | None
    metadata: dict | None
    ip_address: str | None
    created_at: object


class PlatformUserOut(BaseModel):
    id: str
    display_name: str
    email: str
    avatar_url: str | None
    is_suspended: bool
    suspended_at: object | None
    auth_provider: str
    workspace_count: int
    created_at: object


class PlatformUserDetailOut(PlatformUserOut):
    last_workspace_slug: str | None
    email_digest: bool
    product_updates: bool
    project_count: int
    assigned_story_count: int
    is_staff: bool
    staff_member_id: str | None
    staff_role_id: str | None
    staff_role_name: str | None
    staff_is_active: bool | None
    last_suspend_reason: str | None


class PlatformUserWorkspaceOut(BaseModel):
    workspace_id: str
    workspace_slug: str
    workspace_name: str
    role: str
    status: str
    joined_at: object


class UpdatePlatformUserPayload(BaseModel):
    is_suspended: bool | None = None
    reason: str | None = None
    display_name: str | None = None
    email_digest: bool | None = None
    product_updates: bool | None = None


def _auth_provider(user: User) -> str:
    has_google = bool(user.google_sub)
    has_password = bool(user.password_hash)
    if has_google and has_password:
        return "both"
    if has_google:
        return "google"
    return "password"


async def _workspace_count(db: AsyncSession, user_id: str) -> int:
    return (
        await db.execute(
            select(func.count())
            .select_from(WorkspaceMember)
            .where(WorkspaceMember.user_id == user_id)
        )
    ).scalar() or 0


async def _project_count(db: AsyncSession, user_id: str) -> int:
    return (
        await db.execute(
            select(func.count())
            .select_from(ProjectMember)
            .where(ProjectMember.user_id == user_id)
        )
    ).scalar() or 0


async def _assigned_story_count(db: AsyncSession, user_id: str) -> int:
    return (
        await db.execute(
            select(func.count()).select_from(Story).where(Story.assignee_id == user_id)
        )
    ).scalar() or 0


async def _last_suspend_reason(db: AsyncSession, user_id: str) -> str | None:
    row = (
        await db.execute(
            select(AuditLog)
            .where(
                AuditLog.action == "user.suspend",
                AuditLog.target_type == "user",
                AuditLog.target_id == user_id,
            )
            .order_by(AuditLog.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if row and row.meta:
        reason = row.meta.get("reason")
        if isinstance(reason, str) and reason.strip():
            return reason.strip()
    return None


async def _staff_for_user(db: AsyncSession, user_id: str) -> StaffMember | None:
    return (
        await db.execute(
            select(StaffMember)
            .options(selectinload(StaffMember.role))
            .where(StaffMember.user_id == user_id)
        )
    ).scalar_one_or_none()


async def _platform_user_out(db: AsyncSession, user: User) -> PlatformUserOut:
    return PlatformUserOut(
        id=user.id,
        display_name=user.display_name,
        email=user.email,
        avatar_url=user.avatar_url,
        is_suspended=bool(user.is_suspended),
        suspended_at=user.suspended_at,
        auth_provider=_auth_provider(user),
        workspace_count=await _workspace_count(db, user.id),
        created_at=user.created_at,
    )


async def _platform_user_detail_out(db: AsyncSession, user: User) -> PlatformUserDetailOut:
    staff = await _staff_for_user(db, user.id)
    base = await _platform_user_out(db, user)
    return PlatformUserDetailOut(
        **base.model_dump(),
        last_workspace_slug=user.last_workspace_slug,
        email_digest=bool(user.email_digest),
        product_updates=bool(user.product_updates),
        project_count=await _project_count(db, user.id),
        assigned_story_count=await _assigned_story_count(db, user.id),
        is_staff=staff is not None,
        staff_member_id=staff.id if staff else None,
        staff_role_id=staff.role_id if staff else None,
        staff_role_name=staff.role.name if staff else None,
        staff_is_active=staff.is_active if staff else None,
        last_suspend_reason=await _last_suspend_reason(db, user.id),
    )


def _audit_log_out(rows: list[AuditLog], names: dict[str, str]) -> list[AuditLogOut]:
    def _actor_name(r: AuditLog) -> str:
        if r.actor_name is not None:
            return r.actor_name
        if r.actor_staff_id:
            return names.get(r.actor_staff_id, "—")
        return "—"

    return [
        AuditLogOut(
            id=r.id,
            actor_staff_id=r.actor_staff_id,
            actor_name=_actor_name(r),
            action=r.action,
            target_type=r.target_type,
            target_id=r.target_id,
            metadata=r.meta,
            ip_address=r.ip_address,
            created_at=r.created_at,
        )
        for r in rows
    ]


async def _resolve_actor_names(db: AsyncSession, rows: list[AuditLog]) -> dict[str, str]:
    names: dict[str, str] = {}
    for row in rows:
        if row.actor_name is None and row.actor_staff_id and row.actor_staff_id not in names:
            member = (
                await db.execute(
                    select(StaffMember)
                    .options(selectinload(StaffMember.user))
                    .where(StaffMember.id == row.actor_staff_id)
                )
            ).scalar_one_or_none()
            names[row.actor_staff_id] = member.user.display_name if member else "—"
    return names


async def _user_or_404(db: AsyncSession, user_id: str) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user


@router.get("/users/", response_model=OffsetPageOut[PlatformUserOut])
async def list_platform_users(
    q: str | None = None,
    status: str = "all",
    limit: int = 50,
    offset: int = 0,
    ctx: StaffContext = Depends(require_privilege("users.read")),
    db: AsyncSession = Depends(get_db),
):
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    count_stmt = select(func.count(User.id))
    list_stmt = select(User).order_by(User.display_name)
    if status == "active":
        count_stmt = count_stmt.where(User.is_suspended.is_(False))
        list_stmt = list_stmt.where(User.is_suspended.is_(False))
    elif status == "suspended":
        count_stmt = count_stmt.where(User.is_suspended.is_(True))
        list_stmt = list_stmt.where(User.is_suspended.is_(True))
    if q and q.strip():
        like = f"%{q.strip()}%"
        clause = (User.display_name.ilike(like)) | (User.email.ilike(like))
        count_stmt = count_stmt.where(clause)
        list_stmt = list_stmt.where(clause)
    total = int((await db.scalar(count_stmt)) or 0)
    users = (await db.execute(list_stmt.limit(limit).offset(offset))).scalars().all()
    items = [await _platform_user_out(db, u) for u in users]
    return OffsetPageOut(items=items, total=total, limit=limit, offset=offset)


@router.get("/users/{user_id}/", response_model=PlatformUserDetailOut)
async def get_platform_user(
    user_id: str,
    ctx: StaffContext = Depends(require_privilege("users.read")),
    db: AsyncSession = Depends(get_db),
):
    return await _platform_user_detail_out(db, await _user_or_404(db, user_id))


@router.get("/users/{user_id}/workspaces/", response_model=list[PlatformUserWorkspaceOut])
async def list_platform_user_workspaces(
    user_id: str,
    ctx: StaffContext = Depends(require_privilege("users.read")),
    db: AsyncSession = Depends(get_db),
):
    await _user_or_404(db, user_id)
    rows = (
        await db.execute(
            select(WorkspaceMember, Workspace)
            .join(Workspace, WorkspaceMember.workspace_id == Workspace.id)
            .where(WorkspaceMember.user_id == user_id)
            .order_by(Workspace.name)
        )
    ).all()
    return [
        PlatformUserWorkspaceOut(
            workspace_id=ws.id,
            workspace_slug=ws.slug,
            workspace_name=ws.name,
            role=member.role.value if hasattr(member.role, "value") else str(member.role),
            status=member.status.value if hasattr(member.status, "value") else str(member.status),
            joined_at=member.created_at,
        )
        for member, ws in rows
    ]


@router.get("/users/{user_id}/activity/", response_model=OffsetPageOut[AuditLogOut])
async def list_platform_user_activity(
    user_id: str,
    limit: int = 50,
    offset: int = 0,
    ctx: StaffContext = Depends(require_privilege("users.read")),
    db: AsyncSession = Depends(get_db),
):
    await _user_or_404(db, user_id)
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    base = (
        AuditLog.target_type == "user",
        AuditLog.target_id == user_id,
    )
    total = int(
        (
            await db.scalar(
                select(func.count(AuditLog.id)).where(*base)
            )
        )
        or 0
    )
    rows = list(
        (
            await db.execute(
                select(AuditLog)
                .where(*base)
                .order_by(AuditLog.created_at.desc())
                .limit(limit)
                .offset(offset)
            )
        ).scalars().all()
    )
    names = await _resolve_actor_names(db, rows)
    return OffsetPageOut(
        items=_audit_log_out(rows, names),
        total=total,
        limit=limit,
        offset=offset,
    )


@router.patch("/users/{user_id}/", response_model=PlatformUserDetailOut)
async def update_platform_user(
    user_id: str,
    payload: UpdatePlatformUserPayload,
    ctx: StaffContext = Depends(get_staff_context),
    db: AsyncSession = Depends(get_db),
):
    user = await _user_or_404(db, user_id)
    has_profile = any(
        v is not None for v in (payload.display_name, payload.email_digest, payload.product_updates)
    )
    if payload.is_suspended is None and not has_profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No fields to update")

    if payload.is_suspended is not None:
        if "users.suspend" not in ctx.privileges:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Missing privilege: users.suspend")
        before = {"is_suspended": bool(user.is_suspended)}
        user.is_suspended = payload.is_suspended
        user.suspended_at = datetime.now(timezone.utc) if payload.is_suspended else None
        action = "user.suspend" if payload.is_suspended else "user.unsuspend"
        meta: dict = {
            "before": before,
            "after": {"is_suspended": user.is_suspended},
        }
        if payload.reason:
            meta["reason"] = payload.reason.strip()
        await record_audit(
            db,
            ctx,
            action,
            target_type="user",
            target_id=user_id,
            meta=meta,
        )

    if has_profile:
        if "users.manage" not in ctx.privileges:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Missing privilege: users.manage")
        before_profile = {
            "display_name": user.display_name,
            "email_digest": bool(user.email_digest),
            "product_updates": bool(user.product_updates),
        }
        if payload.display_name is not None:
            name = payload.display_name.strip()
            if not name:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Display name is required")
            user.display_name = name
        if payload.email_digest is not None:
            user.email_digest = payload.email_digest
        if payload.product_updates is not None:
            user.product_updates = payload.product_updates
        await record_audit(
            db,
            ctx,
            "user.update",
            target_type="user",
            target_id=user_id,
            meta={
                "before": before_profile,
                "after": {
                    "display_name": user.display_name,
                    "email_digest": bool(user.email_digest),
                    "product_updates": bool(user.product_updates),
                },
            },
        )

    await db.commit()
    return await _platform_user_detail_out(db, user)


@router.get("/audit-logs/", response_model=OffsetPageOut[AuditLogOut])
async def list_audit_logs(
    action: str | None = None,
    actor_staff_id: str | None = None,
    created_from: datetime | None = None,
    created_to: datetime | None = None,
    limit: int = 100,
    offset: int = 0,
    ctx: StaffContext = Depends(require_privilege("audit.read")),
    db: AsyncSession = Depends(get_db),
):
    limit = max(1, min(limit, 500))
    offset = max(0, offset)
    count_stmt = select(func.count(AuditLog.id))
    list_stmt = select(AuditLog).order_by(AuditLog.created_at.desc())
    if action:
        count_stmt = count_stmt.where(AuditLog.action == action)
        list_stmt = list_stmt.where(AuditLog.action == action)
    if actor_staff_id:
        count_stmt = count_stmt.where(AuditLog.actor_staff_id == actor_staff_id)
        list_stmt = list_stmt.where(AuditLog.actor_staff_id == actor_staff_id)
    if created_from:
        count_stmt = count_stmt.where(AuditLog.created_at >= created_from)
        list_stmt = list_stmt.where(AuditLog.created_at >= created_from)
    if created_to:
        count_stmt = count_stmt.where(AuditLog.created_at <= created_to)
        list_stmt = list_stmt.where(AuditLog.created_at <= created_to)
    total = int((await db.scalar(count_stmt)) or 0)
    rows = list((await db.execute(list_stmt.limit(limit).offset(offset))).scalars().all())
    names = await _resolve_actor_names(db, rows)
    return OffsetPageOut(
        items=_audit_log_out(rows, names),
        total=total,
        limit=limit,
        offset=offset,
    )
