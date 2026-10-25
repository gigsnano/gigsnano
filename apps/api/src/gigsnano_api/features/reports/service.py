"""Portfolio reports: one grouped query per figure across the caller's visible projects."""
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.models import User
from gigsnano_api.features.briefing.service import latest_snapshots, normalize_health
from gigsnano_api.features.reports.schemas import (
    AtRiskOut,
    CycleReportOut,
    OnTimeOut,
    ReportBucketOut,
    ReportsOut,
    TeamLoadOut,
    ThroughputOut,
    TReportBucket,
    TReportRange,
)
from gigsnano_api.models import (
    Cycle,
    ECycleStatus,
    EStoryActivityField,
    EStoryStatus,
    Project,
    Story,
    StoryActivity,
)
from gigsnano_api.shared.context import (
    WorkspaceContext,
    accessible_project_ids,
    narrow_project_ids,
)

_SPANS: dict[TReportRange, tuple[int, TReportBucket]] = {"7d": (7, "day"), "30d": (30, "day"), "quarter": (90, "week")}
TEAM_LOAD_LIMIT = 8
CYCLE_LIMIT = 10


def resolve_range(range_: TReportRange, today: date) -> tuple[date, date, TReportBucket]:
    days, bucket = _SPANS[range_]
    return today - timedelta(days=days - 1), today, bucket


def previous_window(start: date, end: date) -> tuple[date, date]:
    length = (end - start).days + 1
    return start - timedelta(days=length), start - timedelta(days=1)


def bucket_starts(start: date, end: date, bucket: str) -> list[date]:
    if bucket == "day":
        return [start + timedelta(days=i) for i in range((end - start).days + 1)]
    first = start - timedelta(days=start.weekday())
    return [first + timedelta(weeks=i) for i in range((end - first).days // 7 + 1)]


def bucket_of(day: date, bucket: str) -> date:
    return day if bucket == "day" else day - timedelta(days=day.weekday())


def on_time_pct(done_with_target: int, on_time: int) -> int | None:
    if done_with_target == 0:
        return None
    return round(on_time / done_with_target * 100)


def _utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


async def _visible_pids(db: AsyncSession, ctx: WorkspaceContext, project_ids: str | None):
    pids = narrow_project_ids(await accessible_project_ids(db, ctx), project_ids)
    if pids is None:
        pids = list((await db.execute(
            select(Project.id).where(Project.workspace_id == ctx.workspace.id)
        )).scalars())
    return pids


async def _last_done(db: AsyncSession, pids: list[str], start: date, end: date):
    """(last done-transition date in window, target_date, status) per live story."""
    lo = datetime.combine(start, time.min, tzinfo=timezone.utc)
    hi = datetime.combine(end + timedelta(days=1), time.min, tzinfo=timezone.utc)
    rows = (await db.execute(
        select(Story.id, func.max(StoryActivity.created_at), Story.target_date, Story.status)
        .join(StoryActivity, StoryActivity.story_id == Story.id)
        .where(Story.project_id.in_(pids), Story.deleted_at.is_(None),
               StoryActivity.field == EStoryActivityField.STATUS,
               StoryActivity.new_value == EStoryStatus.DONE.value,
               StoryActivity.created_at >= lo, StoryActivity.created_at < hi)
        .group_by(Story.id, Story.target_date, Story.status)
    )).all()
    return [(_utc(at).date(), target, status) for _, at, target, status in rows]


def _on_time_counts(rows) -> tuple[int, int]:
    with_target = [(d, t) for d, t, s in rows if t is not None and s == EStoryStatus.DONE]
    return len(with_target), sum(1 for d, t in with_target if d <= t)


async def _throughput_and_on_time(db, pids, start, end, bucket):
    cur = await _last_done(db, pids, start, end)
    prev = await _last_done(db, pids, *previous_window(start, end))
    counts: dict[date, int] = defaultdict(int)
    for day, _, _ in cur:
        counts[bucket_of(day, bucket)] += 1
    throughput = ThroughputOut(
        total=len(cur), previous_total=len(prev),
        buckets=[ReportBucketOut(start=b, completed=counts[b])
                 for b in bucket_starts(start, end, bucket)],
    )
    done_with_target, on_time = _on_time_counts(cur)
    prev_total, prev_on_time = _on_time_counts(prev)
    return throughput, OnTimeOut(
        done_with_target=done_with_target, on_time=on_time,
        pct=on_time_pct(done_with_target, on_time),
        previous_pct=on_time_pct(prev_total, prev_on_time),
    )


async def _at_risk(db, pids) -> AtRiskOut:
    snaps = await latest_snapshots(db, pids)
    health = [normalize_health(s.health_status) for s in snaps.values()]
    return AtRiskOut(at_risk=health.count("at_risk"), off_track=health.count("off_track"),
                     total_projects=len(pids))


async def _team_load(db, pids) -> list[TeamLoadOut]:
    rows = (await db.execute(
        select(Story.assignee_id, User.display_name, func.count())
        .outerjoin(User, User.id == Story.assignee_id)
        .where(Story.project_id.in_(pids), Story.deleted_at.is_(None),
               Story.status != EStoryStatus.DONE)
        .group_by(Story.assignee_id, User.display_name)
    )).all()
    load = [TeamLoadOut(user_id=uid, display_name=name or "Unassigned", open=n)
            for uid, name, n in rows]
    load.sort(key=lambda t: (-t.open, t.display_name.lower()))
    return load[:TEAM_LOAD_LIMIT]


async def _cycles(db, pids, start: date, end: date) -> list[CycleReportOut]:
    cycles = (await db.execute(
        select(Cycle, Project.name).join(Project, Project.id == Cycle.project_id)
        .where(Cycle.project_id.in_(pids), Cycle.is_sprint_zero.is_(False),
               (Cycle.status == ECycleStatus.ACTIVE)
               | ((Cycle.status == ECycleStatus.COMPLETED)
                  & Cycle.end_date.between(start, end)))
    )).all()
    if not cycles:
        return []
    counts = {
        cid: (int(t), int(d or 0))
        for cid, t, d in (await db.execute(
            select(Story.cycle_id, func.count(),
                   func.sum(case((Story.status == EStoryStatus.DONE, 1), else_=0)))
            .where(Story.cycle_id.in_([c.id for c, _ in cycles]), Story.deleted_at.is_(None))
            .group_by(Story.cycle_id)
        )).all()
    }
    out = []
    for c, project_name in cycles:
        total, done = counts.get(c.id, (0, 0))
        out.append(CycleReportOut(
            cycle_id=c.id, cycle_name=c.name, project_id=c.project_id,
            project_name=project_name, status=c.status.value, total=total, done=done,
            pct=round(done / total * 100) if total else 0, end_date=c.end_date,
        ))
    out.sort(key=lambda c: (c.status != "active", -(c.end_date or date.min).toordinal()))
    return out[:CYCLE_LIMIT]


async def build_reports(
    db: AsyncSession, ctx: WorkspaceContext, range_: TReportRange, project_ids: str | None, today: date,
) -> ReportsOut:
    start, end, bucket = resolve_range(range_, today)
    pids = await _visible_pids(db, ctx, project_ids)
    if pids:
        throughput, on_time = await _throughput_and_on_time(db, pids, start, end, bucket)
        at_risk = await _at_risk(db, pids)
        team_load = await _team_load(db, pids)
        cycles = await _cycles(db, pids, start, end)
    else:
        throughput = ThroughputOut(total=0, previous_total=0, buckets=[
            ReportBucketOut(start=b, completed=0) for b in bucket_starts(start, end, bucket)])
        on_time = OnTimeOut(done_with_target=0, on_time=0, pct=None, previous_pct=None)
        at_risk = AtRiskOut(at_risk=0, off_track=0, total_projects=0)
        team_load, cycles = [], []
    return ReportsOut(
        range=range_, period_from=start, period_to=end, bucket=bucket,
        throughput=throughput, on_time=on_time, at_risk=at_risk,
        team_load=team_load, cycles=cycles,
    )
