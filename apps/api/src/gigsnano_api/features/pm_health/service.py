"""PM-reported health updates (GIN-337): append-only versioned judgments, stored
separately from system health, gated by project write permission and audited.

Never mutates system health (GIN-336) — a different table entirely — so the two
can disagree and both stay visible. An "edit" is a new version (a new row); a
"retract" flips `retracted_at` and keeps the row in history."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.models import (
    EMemberStatus,
    EProjectActivityType,
    PmHealthUpdate,
    Project,
    ProjectActivity,
    ProjectMember,
)
from gigsnano_api.shared.context import WorkspaceContext, reject_if_project_viewer

from .schemas import CreatePmHealthUpdatePayload


def _audit(db: AsyncSession, project_id: str, ctx: WorkspaceContext, action: str) -> None:
    db.add(
        ProjectActivity(
            project_id=project_id,
            type=EProjectActivityType.UPDATED,
            actor_name=ctx.user.display_name,
            actor_avatar_url=ctx.user.avatar_url,
            action=action,
        )
    )


async def _assert_active_member(db: AsyncSession, project_id: str, user_id: str) -> None:
    row = (
        await db.execute(
            select(ProjectMember.user_id).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == user_id,
                ProjectMember.status == EMemberStatus.ACTIVE,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Recovery owner must be an active project member"
        )


async def create_pm_update(
    db: AsyncSession,
    project: Project,
    ctx: WorkspaceContext,
    payload: CreatePmHealthUpdatePayload,
) -> PmHealthUpdate:
    # Write permission: workspace Owner/Admin bypass, project Viewers are rejected.
    await reject_if_project_viewer(db, ctx, project.id)
    if payload.recovery_owner_id is not None:
        await _assert_active_member(db, project.id, payload.recovery_owner_id)

    update = PmHealthUpdate(
        project_id=project.id,
        reported_status=payload.reported_status,
        narrative=payload.narrative,
        key_risks=payload.key_risks,
        next_milestone=payload.next_milestone,
        next_milestone_date=payload.next_milestone_date,
        decision_needed=payload.decision_needed,
        recovery_owner_id=payload.recovery_owner_id,
        next_review_date=payload.next_review_date,
        work_item_refs=payload.work_item_refs,
        author_id=ctx.user.id,
        author_name=ctx.user.display_name,
    )
    db.add(update)
    _audit(db, project.id, ctx, f"posted a PM health update ({payload.reported_status.value})")
    await db.commit()
    await db.refresh(update)
    return update


async def list_pm_updates(db: AsyncSession, project: Project) -> list[PmHealthUpdate]:
    """Full revision history, newest first (includes retracted versions)."""
    rows = await db.execute(
        select(PmHealthUpdate)
        .where(PmHealthUpdate.project_id == project.id)
        .order_by(PmHealthUpdate.created_at.desc())
    )
    return list(rows.scalars().all())


async def latest_pm_update(db: AsyncSession, project: Project) -> PmHealthUpdate | None:
    """The current PM-reported health: newest non-retracted version, or None."""
    row = await db.execute(
        select(PmHealthUpdate)
        .where(PmHealthUpdate.project_id == project.id, PmHealthUpdate.retracted_at.is_(None))
        .order_by(PmHealthUpdate.created_at.desc())
        .limit(1)
    )
    return row.scalar_one_or_none()


async def retract_pm_update(
    db: AsyncSession, project: Project, ctx: WorkspaceContext, update_id: str
) -> None:
    await reject_if_project_viewer(db, ctx, project.id)
    update = await db.get(PmHealthUpdate, update_id)
    if update is None or update.project_id != project.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "PM update not found")
    if update.retracted_at is None:
        update.retracted_at = datetime.now(timezone.utc)
        _audit(db, project.id, ctx, "retracted a PM health update")
        await db.commit()
