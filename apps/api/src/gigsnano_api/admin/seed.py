"""Idempotent staff bootstrap. Runs on every startup: ensures the Superadmin
system role exists and grants it to any existing user whose email is listed in
STAFF_BOOTSTRAP_EMAILS. Safe to run repeatedly and on an empty DB."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.models import User
from gigsnano_api.core.config import settings
from gigsnano_api.models import StaffMember, StaffRole

SUPERADMIN_ROLE_NAME = "Superadmin"


def bootstrap_emails() -> list[str]:
    raw = settings.staff_bootstrap_emails or ""
    return [e.strip().lower() for e in raw.split(",") if e.strip()]


async def ensure_superadmin_role(db: AsyncSession) -> StaffRole:
    existing = (
        await db.execute(select(StaffRole).where(StaffRole.name == SUPERADMIN_ROLE_NAME))
    ).scalar_one_or_none()
    if existing:
        return existing
    role = StaffRole(
        name=SUPERADMIN_ROLE_NAME,
        description="Full platform access. System role — cannot be edited or deleted.",
        privileges=[],
        is_system=True,
    )
    db.add(role)
    await db.flush()
    return role


async def seed_staff(db: AsyncSession) -> None:
    emails = bootstrap_emails()
    role = await ensure_superadmin_role(db)
    if not emails:
        await db.commit()
        return
    users = (
        await db.execute(select(User).where(func.lower(User.email).in_(emails)))
    ).scalars().all()
    for user in users:
        already = (
            await db.execute(select(StaffMember).where(StaffMember.user_id == user.id))
        ).scalar_one_or_none()
        if already:
            continue
        db.add(StaffMember(user_id=user.id, role_id=role.id, is_active=True))
    await db.commit()
