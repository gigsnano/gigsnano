from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from gigsnano_api.admin.privileges import PRIVILEGE_KEYS
from gigsnano_api.auth.deps import get_current_user
from gigsnano_api.auth.models import User
from gigsnano_api.core.db import get_db
from gigsnano_api.models import StaffMember, StaffRole


def resolve_privileges(role: StaffRole) -> set[str]:
    if role.is_system:
        return set(PRIVILEGE_KEYS)
    return set(role.privileges or [])


@dataclass
class StaffContext:
    user: User
    staff: StaffMember
    role: StaffRole
    privileges: set[str]
    ip_address: str | None
    user_agent: str | None


async def get_staff_context(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StaffContext:
    result = await db.execute(
        select(StaffMember)
        .options(selectinload(StaffMember.role))
        .where(StaffMember.user_id == user.id, StaffMember.is_active.is_(True))
    )
    staff = result.scalar_one_or_none()
    if staff is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a staff member")
    return StaffContext(
        user=user,
        staff=staff,
        role=staff.role,
        privileges=resolve_privileges(staff.role),
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )


def require_privilege(key: str):
    async def dependency(ctx: StaffContext = Depends(get_staff_context)) -> StaffContext:
        if key not in ctx.privileges:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Missing privilege: {key}")
        return ctx

    return dependency
