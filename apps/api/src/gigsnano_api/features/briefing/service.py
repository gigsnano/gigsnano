"""Today's briefing for the mobile app: every visible project's pulse in one call.

Each figure is one grouped query across the caller's projects; nothing loops per project.
"""

from datetime import date, datetime, timedelta, timezone
from typing import cast

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.features.briefing.schemas import (
    BriefingChangesOut,
    BriefingCycleOut,
    BriefingOut,
    BriefingProjectOut,
    Health,
)
from gigsnano_api.features.inbox.service import build_inbox
from gigsnano_api.models import (
    Artifact,
    Cycle,
    EArtifactStatus,
    ECycleStatus,
    EStoryActivityField,
    EStoryStatus,
    ForecastSnapshot,
    Project,
    Story,
    StoryActivity,
)
from gigsnano_api.shared.context import WorkspaceContext, accessible_project_ids

DEFAULT_WINDOW = timedelta(hours=24)
MAX_WINDOW = timedelta(days=30)
DEFAULT_CYCLE_DAYS = 14
HEALTH_ORDER = {"off_track": 0, "at_risk": 1, "no_data": 2, "on_track": 3}


def resolve_since(since: datetime | None, now: datetime) -> datetime:
    if since is None:
        return now - DEFAULT_WINDOW
    if since.tzinfo is None:
        since = since.replace(tzinfo=timezone.utc)
    return max(since, now - MAX_WINDOW)


def slip_days(target: date, forecast_at: datetime | None) -> int | None:
    return None if forecast_at is None else (forecast_at.date() - target).days


def cycle_days_left(cycle, today: date) -> int:
    end = cycle.end_date or (
        (cycle.start_date or today) + timedelta(days=DEFAULT_CYCLE_DAYS)
    )
    return max((end - today).days, 0)


def normalize_health(value: str | None) -> Health:
    return cast(Health, value if value in HEALTH_ORDER else "no_data")


def _health(snap) -> Health:
    return normalize_health(snap.health_status if snap else None)


async def _counts(db: AsyncSession, query) -> dict[str, int]:
    return {pid: int(n or 0) for pid, n in (await db.execute(query)).all()}


async def _story_counts(db: AsyncSession, pids: list[str], since: datetime, today: date):
    live = (Story.project_id.in_(pids), Story.deleted_at.is_(None))
    totals = {
        pid: (int(t or 0), int(d or 0))
        for pid, t, d in (await db.execute(
            select(
                Story.project_id,
                func.count(),
                func.sum(case((Story.status == EStoryStatus.DONE, 1), else_=0)),
            ).where(*live).group_by(Story.project_id)
        )).all()
    }
    done_since = await _counts(db, (
        select(Story.project_id, func.count())
        .join(StoryActivity, StoryActivity.story_id == Story.id)
        .where(*live,
               StoryActivity.field == EStoryActivityField.STATUS,
               StoryActivity.new_value == EStoryStatus.DONE.value,
               StoryActivity.created_at >= since)
        .group_by(Story.project_id)
    ))
    created = await _counts(db, (
        select(Story.project_id, func.count())
        .where(*live, Story.created_at >= since).group_by(Story.project_id)
    ))
    overdue = await _counts(db, (
        select(Story.project_id, func.count())
        .where(*live, Story.status != EStoryStatus.DONE, Story.target_date < today)
        .group_by(Story.project_id)
    ))
    return totals, done_since, created, overdue


async def _docs_finalized(db: AsyncSession, pids: list[str], since: datetime) -> dict[str, int]:
    return await _counts(db, (
        select(Artifact.project_id, func.count())
        .where(Artifact.project_id.in_(pids), Artifact.status == EArtifactStatus.FINAL,
               Artifact.created_at >= since)
        .group_by(Artifact.project_id)
    ))


async def latest_snapshots(db: AsyncSession, pids: list[str]) -> dict[str, ForecastSnapshot]:
    latest = (
        select(ForecastSnapshot.project_id, func.max(ForecastSnapshot.calculated_at).label("at"))
        .where(ForecastSnapshot.project_id.in_(pids))
        .group_by(ForecastSnapshot.project_id)
        .subquery()
    )
    return {
        s.project_id: s
        for s in (await db.execute(
            select(ForecastSnapshot).join(
                latest,
                (ForecastSnapshot.project_id == latest.c.project_id)
                & (ForecastSnapshot.calculated_at == latest.c.at),
            )
        )).scalars()
    }


async def _current_cycles(db: AsyncSession, pids: list[str]) -> dict[str, Cycle]:
    cycles: dict[str, Cycle] = {}
    for c in (await db.execute(
        select(Cycle)
        .where(Cycle.project_id.in_(pids), Cycle.status == ECycleStatus.ACTIVE)
        .order_by(Cycle.start_date.desc().nulls_last())
    )).scalars():
        cycles.setdefault(c.project_id, c)  # first row per project = latest start
    return cycles


def _project_out(p, today: date, counts: tuple[int, int], snap, cycle,
                 changes: BriefingChangesOut) -> BriefingProjectOut:
    total, done = counts
    forecast_at = snap.p85_date if snap else None
    if forecast_at is not None and forecast_at.tzinfo is None:
        forecast_at = forecast_at.replace(tzinfo=timezone.utc)
    return BriefingProjectOut(
        id=p.id, name=p.name, identifier=p.identifier, logo_emoji=p.logo_emoji,
        progress_pct=round(done / total * 100) if total else 0, total=total, done=done,
        health=_health(snap),
        target_date=p.target_date, forecast_date=forecast_at,
        slip_days=slip_days(p.target_date, forecast_at),
        cycle=(BriefingCycleOut(id=cycle.id, name=cycle.name,
                                days_left=cycle_days_left(cycle, today))
               if cycle else None),
        changes=changes,
    )


async def build_briefing(
    db: AsyncSession, ctx: WorkspaceContext, *, since: datetime, now: datetime
) -> BriefingOut:
    today = now.date()
    needs_you = (await build_inbox(db, ctx)).counts
    ids = await accessible_project_ids(db, ctx)
    pq = select(Project).where(Project.workspace_id == ctx.workspace.id)
    if ids is not None:
        pq = pq.where(Project.id.in_(ids))
    projects = list((await db.execute(pq)).scalars())
    pids = [p.id for p in projects]
    if not pids:
        return BriefingOut(generated_at=now, since=since, needs_you=needs_you, projects=[])

    totals, done_since, created, overdue = await _story_counts(db, pids, since, today)
    docs = await _docs_finalized(db, pids, since)
    snapshots = await latest_snapshots(db, pids)
    cycles = await _current_cycles(db, pids)

    out = [
        _project_out(
            p, today, totals.get(p.id, (0, 0)), snapshots.get(p.id), cycles.get(p.id),
            BriefingChangesOut(done=done_since.get(p.id, 0), created=created.get(p.id, 0),
                               overdue=overdue.get(p.id, 0), docs_finalized=docs.get(p.id, 0)),
        )
        for p in projects
    ]
    out.sort(key=lambda b: (HEALTH_ORDER[b.health], b.name.lower()))
    return BriefingOut(generated_at=now, since=since, needs_you=needs_you, projects=out)
