"""Personal customizable dashboards (Jira-style). One owner per dashboard.

Mirrors the stickies vertical, but scoped to the current user (owner_id) rather
than shared across the workspace.
"""

from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import get_db, utcnow
from gigsnano_api.features.dashboards.public_widgets import new_public_token, public_widgets
from gigsnano_api.features.dashboards.schemas import (
    CreateDashboardPayload,
    DailyActivityPoint,
    DashboardActivityOut,
    DashboardMetricsOut,
    DashboardOut,
    EChartBucket,
    LabelCountOut,
    PlannedWorkloadOut,
    PlannedWorkloadPoint,
    ShareDashboardPayload,
    UpdateDashboardPayload,
)
from gigsnano_api.models import (
    AuditLog,
    Dashboard,
    EStoryActivityField,
    EStoryPriority,
    EStoryStatus,
    Project,
    ProjectLabel,
    Story,
    StoryActivity,
    StoryLabel,
)
from gigsnano_api.shared.context import (
    WorkspaceContext,
    accessible_project_ids,
    get_workspace_context,
    narrow_project_ids,
)

router = APIRouter(tags=["dashboards"])

_W = "/workspaces/{workspace_slug}"

_DEFAULT_LAYOUT = {"columns": 2}
_DEFAULT_CONFIG: dict = {"widgets": []}

_ACTIVITY_DEFAULT_DAYS = 30
# A window is zero-filled into one point per day, so an unbounded range would let
# a caller allocate an arbitrarily long list. Cap it at ~1y.
_ACTIVITY_MAX_DAYS = 366

# What happened (activity) vs what is scheduled to happen (planned workload).
# Kept apart on purpose: mixing them lets a burst of newly-filed work read as
# delivery, which is the misreading GIN-527 was raised for.
ACTIVITY_SERIES = ("created", "updated", "completed")
PLANNED_SERIES = ("starting", "due", "overdue")


def _day_start(d: date) -> datetime:
    """Midnight UTC on `d`, as an aware datetime for a timestamptz comparison."""
    return datetime.combine(d, time.min, tzinfo=timezone.utc)


def _day_label(value) -> str:
    """ISO day string from whatever `func.date()` returned (date on Postgres, str
    on SQLite)."""
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def _date_filters(column, date_from: date | None, date_to: date | None) -> list:
    """Half-open [from, to+1day) bounds on a timestamptz column.

    Compares the raw column rather than `func.date(column)` so a btree index on
    it stays usable; `date_to` is inclusive of its whole day.
    """
    out = []
    if date_from is not None:
        out.append(column >= _day_start(date_from))
    if date_to is not None:
        out.append(column < _day_start(date_to + timedelta(days=1)))
    return out


async def _day_counts(db: AsyncSession, column, scope: list, day_filters: list) -> dict[str, int]:
    """Work items per calendar day, keyed by ISO day-string, for one date column.

    Rows whose column is NULL drop out on their own: a NULL fails every range
    comparison, so an unscheduled item simply isn't on the schedule.
    """
    day = func.date(column)
    rows = (
        await db.execute(
            select(day, func.count(Story.id))
            .join(Project, Project.id == Story.project_id)
            .where(*scope, *day_filters)
            .group_by(day)
        )
    ).all()
    return {_day_label(value): count for value, count in rows}


async def _activity_day_counts(
    db: AsyncSession,
    scope: list,
    from_: date,
    to_: date,
    extra: list | None = None,
) -> dict[str, int]:
    """Logged story changes per calendar day, optionally narrowed to one kind."""
    day = func.date(StoryActivity.created_at)
    rows = (
        await db.execute(
            select(day, func.count(StoryActivity.id))
            .join(Story, Story.id == StoryActivity.story_id)
            .join(Project, Project.id == Story.project_id)
            .where(
                *scope,
                *(extra or []),
                *_date_filters(StoryActivity.created_at, from_, to_),
            )
            .group_by(day)
        )
    ).all()
    return {_day_label(value): count for value, count in rows}


async def _story_scope(
    db: AsyncSession,
    ctx: WorkspaceContext,
    project_id: str | None,
    project_ids: str | None = None,
) -> list:
    """The workspace's visible, non-deleted stories.

    `deleted_at` is asserted explicitly: the global soft-delete criteria only
    applies when Story is a *selected* entity, and in these aggregates it is
    only joined.
    """
    ids = narrow_project_ids(await accessible_project_ids(db, ctx), project_ids)
    scope = [Project.workspace_id == ctx.workspace.id, Story.deleted_at.is_(None)]
    if ids is not None:
        scope.append(Story.project_id.in_(ids))
    if project_id:
        scope.append(Story.project_id == project_id)
    return scope


def _bucket_starts(from_: date, to_: date, bucket: EChartBucket) -> list[date]:
    """The period start dates covering [from_, to_], oldest first.

    Weeks start on Monday and the first one is clamped to `from_`, so the window
    the caller asked for is exactly the window they get back.
    """
    if bucket is EChartBucket.WEEK:
        cursor = from_ - timedelta(days=from_.weekday())
        starts = []
        while cursor <= to_:
            starts.append(max(cursor, from_))
            cursor += timedelta(days=7)
        return starts
    return [from_ + timedelta(days=i) for i in range((to_ - from_).days + 1)]


def _activity_out(
    from_: date,
    to_: date,
    bucket: EChartBucket,
    counts: dict[str, dict[str, int]],
    series: tuple[str, ...],
    point_model,
):
    """Fold per-day counts into the requested buckets, zero-filling the gaps.

    Weeks are folded here rather than in SQL because `date_trunc` and `strftime`
    disagree across Postgres and SQLite, and the window is capped at ~1y so the
    sum is trivial. Day keys are ISO strings on both sides: `func.date()` yields
    a date on Postgres but a string on SQLite (the house idiom -- see
    billing/ai_usage).
    """
    starts = _bucket_starts(from_, to_, bucket)
    # Each bucket owns every day from its start up to the next bucket's start.
    edges = [*starts[1:], to_ + timedelta(days=1)]
    points = []
    for start, end in zip(starts, edges, strict=True):
        days = [
            (start + timedelta(days=i)).isoformat() for i in range((end - start).days)
        ]
        points.append(
            point_model(
                date=start,
                **{s: sum(counts[s].get(d, 0) for d in days) for s in series},
            )
        )
    return points


def _resolve_window(date_from: date | None, date_to: date | None) -> tuple[date, date]:
    to_ = date_to or datetime.now(timezone.utc).date()
    from_ = date_from or (to_ - timedelta(days=_ACTIVITY_DEFAULT_DAYS - 1))
    if from_ > to_:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "date_from must be on or before date_to",
        )
    if (to_ - from_).days + 1 > _ACTIVITY_MAX_DAYS:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Date range too large (max {_ACTIVITY_MAX_DAYS} days)",
        )
    return from_, to_


def _out(d: Dashboard, slug: str) -> DashboardOut:
    return DashboardOut(
        id=d.id,
        workspace_slug=slug,
        owner_id=d.owner_id,
        name=d.name,
        description=d.description,
        is_favorite=d.is_favorite,
        layout=d.layout,
        config=d.config,
        visibility=d.visibility,
        public_token=d.public_token,
        published_at=d.published_at,
        created_at=d.created_at,
        updated_at=d.updated_at,
    )


def _record_share_audit(db: AsyncSession, action: str, d: Dashboard, actor) -> None:
    """Append a share event to the audit trail. `actor_staff_id` is null because
    this is a workspace-user action, not a staff one; attribution is the
    denormalized name plus `actor_user_id` in `meta`."""
    db.add(
        AuditLog(
            actor_staff_id=None,
            actor_name=actor.display_name,
            action=action,
            target_type="dashboard",
            target_id=d.id,
            meta={
                "workspace_id": d.workspace_id,
                "actor_user_id": actor.id,
                "visibility": d.visibility,
            },
        )
    )


async def _owned_or_404(
    db: AsyncSession, ctx: WorkspaceContext, dashboard_id: str
) -> Dashboard:
    d = await db.get(Dashboard, dashboard_id)
    if d is None or d.workspace_id != ctx.workspace.id or d.owner_id != ctx.user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dashboard not found")
    return d


async def _readable_or_404(
    db: AsyncSession, ctx: WorkspaceContext, dashboard_id: str
) -> Dashboard:
    """A dashboard the caller may READ: their own, or one shared with the workspace.

    Separate from `_owned_or_404` on purpose — sharing widens who can look, never
    who can edit. Every mutating route keeps the owner gate, so a colleague can
    open a shared dashboard and change nothing on it.
    """
    d = await db.get(Dashboard, dashboard_id)
    if d is None or d.workspace_id != ctx.workspace.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dashboard not found")
    if d.owner_id != ctx.user.id and d.visibility != "shared":
        # 404 rather than 403: the same answer as "no such dashboard", so a
        # private one cannot be probed for existence.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dashboard not found")
    return d


@router.get(f"{_W}/dashboards/", response_model=list[DashboardOut])
async def list_dashboards(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    """The caller's own dashboards, plus any shared with the workspace.

    Shared ones appear here rather than behind a second endpoint so the
    directory is one list — a colleague's shared dashboard is something you
    open, not a separate place you go.
    """
    rows = (
        await db.execute(
            select(Dashboard)
            .where(
                Dashboard.workspace_id == ctx.workspace.id,
                or_(
                    Dashboard.owner_id == ctx.user.id,
                    Dashboard.visibility == "shared",
                ),
            )
            .order_by(Dashboard.created_at)
        )
    ).scalars()
    return [_out(d, ctx.workspace.slug) for d in rows.all()]


@router.post(
    f"{_W}/dashboards/",
    response_model=DashboardOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_dashboard(
    payload: CreateDashboardPayload,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    dashboard = Dashboard(
        workspace_id=ctx.workspace.id,
        owner_id=ctx.user.id,
        name=payload.name.strip(),
        description=payload.description,
        layout=payload.layout or dict(_DEFAULT_LAYOUT),
        config=payload.config or {"widgets": []},
    )
    db.add(dashboard)
    await db.commit()
    await db.refresh(dashboard)
    return _out(dashboard, ctx.workspace.slug)


@router.get(f"{_W}/dashboards/metrics/", response_model=DashboardMetricsOut)
async def dashboard_metrics(
    project_id: str | None = None,
    # Comma list — the dashboard-wide filter. Narrows alongside `project_id`.
    project_ids: str | None = None,
    assignee_id: str | None = None,
    priority: EStoryPriority | None = None,
    status: EStoryStatus | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    """Pre-aggregated work-item counts for dashboard widgets (GIN-54).

    One indexed GROUP BY per dimension over the workspace's accessible stories,
    honouring the same optional filters the widgets expose. Defined before the
    `/{dashboard_id}/` route so "metrics" isn't captured as an id.

    `date_from`/`date_to` (GIN-160) bound `created_at` — i.e. "items *created* in
    this window, grouped by the status they're in now". Both are optional and
    absent means all time, so existing widgets are unaffected. This is a snapshot,
    not history: use `/activity/` for what happened on a given day.
    """
    ids = narrow_project_ids(await accessible_project_ids(db, ctx), project_ids)
    filters = [Project.workspace_id == ctx.workspace.id]
    if ids is not None:
        filters.append(Story.project_id.in_(ids))
    if project_id:
        filters.append(Story.project_id == project_id)
    if assignee_id:
        filters.append(Story.assignee_id == assignee_id)
    if priority is not None:
        filters.append(Story.priority == priority)
    if status is not None:
        filters.append(Story.status == status)
    filters.extend(_date_filters(Story.created_at, date_from, date_to))

    def _grouped(*columns):
        return (
            select(*columns, func.count(Story.id))
            .join(Project, Project.id == Story.project_id)
            .where(*filters)
            .group_by(*columns)
        )

    status_rows = (await db.execute(_grouped(Story.status))).all()
    priority_rows = (await db.execute(_grouped(Story.priority))).all()
    assignee_rows = (await db.execute(_grouped(Story.assignee_id))).all()
    assignee_status_rows = (
        await db.execute(_grouped(Story.assignee_id, Story.status))
    ).all()
    # Inner join: unlabelled items have no row here, which is what a label
    # breakdown means. Ordered by the DB so the widget renders without sorting.
    label_rows = (
        await db.execute(
            select(
                ProjectLabel.id,
                ProjectLabel.name,
                ProjectLabel.color,
                func.count(Story.id).label("count"),
            )
            .select_from(Story)
            .join(Project, Project.id == Story.project_id)
            .join(StoryLabel, StoryLabel.story_id == Story.id)
            .join(ProjectLabel, ProjectLabel.id == StoryLabel.label_id)
            .where(*filters)
            .group_by(ProjectLabel.id, ProjectLabel.name, ProjectLabel.color)
            .order_by(func.count(Story.id).desc())
        )
    ).all()

    def _key(v) -> str:
        return v.value if hasattr(v, "value") else v

    status_counts = {s.value: 0 for s in EStoryStatus}
    for key, count in status_rows:
        status_counts[_key(key)] = count

    priority_counts = {p.value: 0 for p in EStoryPriority}
    for key, count in priority_rows:
        priority_counts[_key(key)] = count

    assignee_counts: dict[str, int] = {}
    for key, count in assignee_rows:
        assignee_counts[key or "unassigned"] = count

    # assignee -> {status -> count}, every status present so the table renders a
    # full row of zeroes rather than gaps (GIN-164).
    assignee_status_counts: dict[str, dict[str, int]] = {}
    for aid, st, count in assignee_status_rows:
        row = assignee_status_counts.setdefault(
            aid or "unassigned", {s.value: 0 for s in EStoryStatus}
        )
        row[_key(st)] = count

    total = sum(status_counts.values())
    return DashboardMetricsOut(
        total=total,
        open=total - status_counts.get(EStoryStatus.DONE.value, 0),
        status_counts=status_counts,
        priority_counts=priority_counts,
        assignee_counts=assignee_counts,
        assignee_status_counts=assignee_status_counts,
        label_counts=[
            LabelCountOut(id=r[0], name=r[1], color=r[2], count=r[3]) for r in label_rows
        ],
    )


@router.get(f"{_W}/dashboards/activity/", response_model=DashboardActivityOut)
async def dashboard_activity(
    project_id: str | None = None,
    project_ids: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    bucket: EChartBucket = EChartBucket.DAY,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    """What actually happened to work items, per period (GIN-161/163, GIN-527).

    Three series, all *events* that occurred inside the window:

    * `created` — items whose `created_at` lands in the period.
    * `updated` — logged changes to an item, from `story_activities`.
    * `completed` — status transitions into `done`, on the day the transition
      happened rather than the item's target date.

    `completed` is a subset of `updated`: closing an item is also a change to it,
    and hiding that would make `updated` disagree with the item's own history.

    Scheduled dates (start/target) are deliberately NOT here -- a planned date is
    not something that happened. They have their own endpoint, `/planned/`, so a
    spike in created work can't be read as a spike in delivery.

    Declared before `/{dashboard_id}/` so "activity" isn't captured as an id.
    """
    from_, to_ = _resolve_window(date_from, date_to)
    scope = await _story_scope(db, ctx, project_id, project_ids)

    # Sequential: one AsyncSession cannot serve concurrent execute() calls.
    counts = {
        "created": await _day_counts(
            db, Story.created_at, scope, _date_filters(Story.created_at, from_, to_)
        ),
        "updated": await _activity_day_counts(db, scope, from_, to_),
        "completed": await _activity_day_counts(
            db,
            scope,
            from_,
            to_,
            extra=[
                StoryActivity.field == EStoryActivityField.STATUS,
                StoryActivity.new_value == EStoryStatus.DONE.value,
            ],
        ),
    }
    return DashboardActivityOut(
        period_from=from_,
        period_to=to_,
        bucket=bucket,
        daily=_activity_out(from_, to_, bucket, counts, ACTIVITY_SERIES, DailyActivityPoint),
    )


@router.get(f"{_W}/dashboards/planned/", response_model=PlannedWorkloadOut)
async def dashboard_planned_workload(
    project_id: str | None = None,
    project_ids: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    bucket: EChartBucket = EChartBucket.DAY,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    """What work is *scheduled* to happen, per period (GIN-527).

    * `starting` — items whose `start_date` falls in the period.
    * `due` — items whose `target_date` falls in the period.
    * `overdue` — items whose `target_date` fell in the period, is now past, and
      which are still open. Settled work is excluded: a late item that shipped is
      history, not a live risk. (`done` is the only settled status today; there
      is no cancelled state, so there is nothing further to exclude.)

    These are calendar dates on the item, not timestamps, so they need no
    timezone handling -- "due the 3rd" is the 3rd everywhere.

    Declared before `/{dashboard_id}/` so "planned" isn't captured as an id.
    """
    from_, to_ = _resolve_window(date_from, date_to)
    scope = await _story_scope(db, ctx, project_id, project_ids)
    starting = [Story.start_date >= from_, Story.start_date <= to_]
    due = [Story.target_date >= from_, Story.target_date <= to_]

    counts = {
        "starting": await _day_counts(db, Story.start_date, scope, starting),
        "due": await _day_counts(db, Story.target_date, scope, due),
        "overdue": await _day_counts(
            db,
            Story.target_date,
            scope,
            [
                *due,
                Story.target_date < datetime.now(timezone.utc).date(),
                Story.status != EStoryStatus.DONE,
            ],
        ),
    }
    return PlannedWorkloadOut(
        period_from=from_,
        period_to=to_,
        bucket=bucket,
        daily=_activity_out(from_, to_, bucket, counts, PLANNED_SERIES, PlannedWorkloadPoint),
    )


@router.get(f"{_W}/dashboards/{{dashboard_id}}/", response_model=DashboardOut)
async def get_dashboard(
    dashboard_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    return _out(await _readable_or_404(db, ctx, dashboard_id), ctx.workspace.slug)


@router.patch(f"{_W}/dashboards/{{dashboard_id}}/", response_model=DashboardOut)
async def update_dashboard(
    dashboard_id: str,
    payload: UpdateDashboardPayload,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    dashboard = await _owned_or_404(db, ctx, dashboard_id)
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("name") is not None:
        dashboard.name = changes["name"].strip()
    if "description" in changes and changes["description"] is not None:
        dashboard.description = changes["description"]
    if "is_favorite" in changes and changes["is_favorite"] is not None:
        dashboard.is_favorite = changes["is_favorite"]
    if "layout" in changes and changes["layout"] is not None:
        dashboard.layout = changes["layout"]
    if "config" in changes and changes["config"] is not None:
        dashboard.config = changes["config"]
    await db.commit()
    await db.refresh(dashboard)
    return _out(dashboard, ctx.workspace.slug)


@router.post(
    f"{_W}/dashboards/{{dashboard_id}}/duplicate/",
    response_model=DashboardOut,
    status_code=status.HTTP_201_CREATED,
)
async def duplicate_dashboard(
    dashboard_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    src = await _owned_or_404(db, ctx, dashboard_id)
    copy = Dashboard(
        workspace_id=ctx.workspace.id,
        owner_id=ctx.user.id,
        name=f"{src.name} (copy)",
        description=src.description,
        layout=dict(src.layout),
        config=dict(src.config),
    )
    db.add(copy)
    await db.commit()
    await db.refresh(copy)
    return _out(copy, ctx.workspace.slug)


@router.post(f"{_W}/dashboards/{{dashboard_id}}/share/", response_model=DashboardOut)
async def share_dashboard(
    dashboard_id: str,
    payload: ShareDashboardPayload,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    """Publish or unpublish a dashboard (GIN-489).

    Owner-only, enforced here rather than by hiding the UI: `_owned_or_404` is
    the same gate the rest of this vertical uses, so anyone else gets a 404 that
    doesn't confirm the dashboard exists. Unpublishing drops the token, which
    revokes every copy of the link on the next request.
    """
    dashboard = await _owned_or_404(db, ctx, dashboard_id)

    if payload.visibility == "public":
        if not public_widgets(dashboard.config):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "This dashboard has no widgets that can be shared publicly",
            )
        if dashboard.public_token is None:
            dashboard.public_token = new_public_token()
        dashboard.visibility = "public"
        dashboard.published_at = utcnow()
        dashboard.published_by = ctx.user.id
        _record_share_audit(db, "dashboard.publish", dashboard, ctx.user)
    elif payload.visibility == "shared":
        # Workspace-internal: the viewer is already authenticated and already
        # entitled to this workspace's data, so there is no token to mint and no
        # public-widget restriction to apply — that restriction exists to keep
        # anonymous link-holders away from widgets that leak, not colleagues.
        dashboard.visibility = "shared"
        dashboard.public_token = None
        dashboard.published_at = utcnow()
        dashboard.published_by = ctx.user.id
        _record_share_audit(db, "dashboard.share_workspace", dashboard, ctx.user)
    else:
        dashboard.visibility = "private"
        dashboard.public_token = None
        _record_share_audit(db, "dashboard.unpublish", dashboard, ctx.user)

    await db.commit()
    await db.refresh(dashboard)
    return _out(dashboard, ctx.workspace.slug)


@router.post(
    f"{_W}/dashboards/{{dashboard_id}}/share/regenerate/", response_model=DashboardOut
)
async def regenerate_public_link(
    dashboard_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    """Rotate the public token. The previous link stops resolving immediately."""
    dashboard = await _owned_or_404(db, ctx, dashboard_id)
    if dashboard.visibility != "public":
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "This dashboard is not published"
        )
    dashboard.public_token = new_public_token()
    dashboard.public_token_rotated_at = utcnow()
    _record_share_audit(db, "dashboard.regenerate_link", dashboard, ctx.user)
    await db.commit()
    await db.refresh(dashboard)
    return _out(dashboard, ctx.workspace.slug)


@router.delete(
    f"{_W}/dashboards/{{dashboard_id}}/",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_dashboard(
    dashboard_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    dashboard = await _owned_or_404(db, ctx, dashboard_id)
    await db.delete(dashboard)
    await db.commit()
    return None
