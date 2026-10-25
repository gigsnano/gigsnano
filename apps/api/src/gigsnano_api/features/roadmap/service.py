"""Roadmap rollup + slip (GIN-206/208). Progress counts copy the module/cycle
two-count pattern keyed on the roadmap FK; slip_band is a pure schedule heuristic
(open items vs days-to-target). Initiative rollup aggregates across its milestones'
projects, gated by the caller's accessible projects."""

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import utcnow
from gigsnano_api.models.roadmap import Initiative, Milestone, Release
from gigsnano_api.models.stories import EStoryStatus, Story

_DONE = EStoryStatus.DONE


def slip_band(total: int, done: int, target_date, today) -> tuple[str, str]:
    """on_track | at_risk | off_track + a concrete reason. ponytail: assumes ~1
    item/day of capacity; swap for measured velocity when there's history to trust."""
    open_ = total - done
    if total == 0:
        return "on_track", "No linked work yet."
    if open_ <= 0:
        return "on_track", "All linked work is done."
    if target_date is None:
        return "on_track", f"{open_} open item(s), no target date set."
    days = (target_date - today).days
    if days < 0:
        return "off_track", f"{open_} open item(s), {-days}d overdue."
    if open_ > days:
        return "at_risk", f"{open_} open item(s) with only {days}d left."
    return "on_track", f"{open_} open item(s), {days}d left."


async def _counts(db: AsyncSession, column, value) -> tuple[int, int]:
    row = (
        await db.execute(
            select(
                func.count(),
                func.sum(case((Story.status == _DONE, 1), else_=0)),
            ).where(column == value)
        )
    ).one()
    return int(row[0] or 0), int(row[1] or 0)


async def rollup_for(db: AsyncSession, column, value, target_date) -> dict:
    total, done = await _counts(db, column, value)
    signal, reason = slip_band(total, done, target_date, utcnow().date())
    return {
        "total": total, "done": done,
        "progress_pct": round(done / total * 100) if total else 0,
        "slip_signal": signal, "slip_reason": reason,
    }


async def initiative_rollup(
    db: AsyncSession, initiative: Initiative, accessible_ids: list[str] | None
) -> dict:
    m_stmt = select(Milestone.id, Milestone.project_id).where(
        Milestone.initiative_id == initiative.id
    )
    if accessible_ids is not None:
        m_stmt = m_stmt.where(Milestone.project_id.in_(accessible_ids))
    milestone_ids = [r[0] for r in (await db.execute(m_stmt)).all()]
    if not milestone_ids:
        signal, reason = slip_band(0, 0, initiative.target_date, utcnow().date())
        return {"total": 0, "done": 0, "progress_pct": 0,
                "slip_signal": signal, "slip_reason": reason}
    row = (
        await db.execute(
            select(
                func.count(),
                func.sum(case((Story.status == _DONE, 1), else_=0)),
            ).where(Story.milestone_id.in_(milestone_ids))
        )
    ).one()
    total, done = int(row[0] or 0), int(row[1] or 0)
    signal, reason = slip_band(total, done, initiative.target_date, utcnow().date())
    return {"total": total, "done": done,
            "progress_pct": round(done / total * 100) if total else 0,
            "slip_signal": signal, "slip_reason": reason}


async def shipped_titles(db: AsyncSession, release: Release) -> list[str]:
    """Titles of DONE work items linked to the release — the changelog source."""
    rows = (
        await db.execute(
            select(Story.title).where(
                Story.release_id == release.id, Story.status == _DONE
            ).order_by(Story.sort_order)
        )
    ).scalars().all()
    return list(rows)
