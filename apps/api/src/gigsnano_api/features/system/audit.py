"""Multi-repo audit trail (GIN-416). Summaries only — never repo URLs, file
content, commands, credentials, or secret values."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.models.system import SystemAuditEvent


async def record(
    db: AsyncSession,
    *,
    project_id: str,
    actor_user_id: str | None,
    action: str,
    object_type: str,
    object_id: str | None = None,
    before: str = "",
    after: str = "",
    reason: str = "",
    correlation_id: str | None = None,
) -> None:
    """Append an audit event and commit it (a failure here must never fail the
    user's action — callers invoke this after the mutation has committed)."""
    db.add(
        SystemAuditEvent(
            project_id=project_id,
            actor_user_id=actor_user_id,
            action=action,
            object_type=object_type,
            object_id=object_id,
            before_summary=before[:2000],
            after_summary=after[:2000],
            reason=reason[:2000],
            correlation_id=correlation_id,
        )
    )
    await db.commit()


async def list_events(
    db: AsyncSession, project_id: str, *, limit: int = 100, offset: int = 0
) -> list[SystemAuditEvent]:
    rows = await db.execute(
        select(SystemAuditEvent)
        .where(SystemAuditEvent.project_id == project_id)
        .order_by(SystemAuditEvent.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(rows.scalars().all())
