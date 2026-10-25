"""Append-only audit trail. record_audit adds an AuditLog row inside the caller's
transaction; the caller commits. Never blocks the primary action — callers may
wrap this in try/except and log on failure for non-critical paths."""

from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.admin.deps import StaffContext
from gigsnano_api.models import AuditLog


async def record_audit(
    db: AsyncSession,
    ctx: StaffContext,
    action: str,
    *,
    target_type: str | None = None,
    target_id: str | None = None,
    meta: dict | None = None,
) -> AuditLog:
    row = AuditLog(
        actor_staff_id=ctx.staff.id,
        actor_name=ctx.user.display_name if ctx.user else None,
        action=action,
        target_type=target_type,
        target_id=target_id,
        meta=meta,
        ip_address=ctx.ip_address,
        user_agent=ctx.user_agent,
    )
    db.add(row)
    await db.flush()
    return row
