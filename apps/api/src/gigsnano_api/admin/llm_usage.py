from datetime import datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.admin.deps import require_privilege
from gigsnano_api.auth.models import User
from gigsnano_api.core.db import get_db
from gigsnano_api.models import ELlmUsageOperation, ELlmUsageSource, LlmUsageEvent, Workspace

router = APIRouter(
    prefix="/llm-usage",
    tags=["admin"],
    dependencies=[Depends(require_privilege("usage.read"))],
)


class PeriodOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_: datetime = Field(alias="from")
    to: datetime


class AggregateBreakdown(BaseModel):
    tokens: int
    cost_usd: float
    count: int


class PriorPeriodOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_: datetime = Field(alias="from")
    to: datetime
    input_tokens: int
    output_tokens: int
    total_tokens: int
    estimated_cost_usd: float
    event_count: int
    delta_tokens_pct: float | None
    delta_cost_pct: float | None


class SummaryOut(BaseModel):
    period: PeriodOut
    input_tokens: int
    output_tokens: int
    total_tokens: int
    estimated_cost_usd: float
    event_count: int
    by_source: dict[str, AggregateBreakdown]
    by_operation: dict[str, AggregateBreakdown]
    prior_period: PriorPeriodOut


class DailyCellOut(BaseModel):
    date: str
    input_tokens: int
    output_tokens: int
    total_tokens: int
    estimated_cost_usd: float
    event_count: int


class MatrixDailyCellOut(BaseModel):
    date: str
    total_tokens: int
    estimated_cost_usd: float
    event_count: int


class HourlyHeatmapCellOut(BaseModel):
    dow: int
    hour: int
    total_tokens: int
    event_count: int


class RankedUsageRowOut(BaseModel):
    id: str
    name: str
    input_tokens: int
    output_tokens: int
    total_tokens: int
    estimated_cost_usd: float
    event_count: int


class MatrixRowOut(BaseModel):
    id: str
    name: str
    total_tokens: int
    estimated_cost_usd: float
    days: list[MatrixDailyCellOut]


class LlmUsageEventOut(BaseModel):
    id: str
    created_at: datetime
    workspace_id: str
    workspace_name: str
    user_id: str
    user_display_name: str
    source: str
    operation: str
    model: str
    input_tokens: int
    output_tokens: int
    total_tokens: int
    estimated_cost_usd: float
    project_id: str | None
    story_id: str | None
    thread_id: str | None


class PaginatedEventsOut(BaseModel):
    items: list[LlmUsageEventOut]
    total: int
    limit: int
    offset: int


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _period_bounds(from_: datetime | None, to: datetime | None) -> tuple[datetime, datetime]:
    to_utc = _as_utc(to) or datetime.now(timezone.utc)
    from_utc = _as_utc(from_) or (to_utc - timedelta(days=7))
    if from_utc >= to_utc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "`from` must be before `to`")
    return from_utc, to_utc


def _base_filters(from_: datetime, to: datetime):
    return and_(LlmUsageEvent.created_at >= from_, LlmUsageEvent.created_at < to)


def _cost(value: Decimal | None) -> float:
    if value is None:
        return 0.0
    return float(value)


async def _totals(db: AsyncSession, from_: datetime, to: datetime) -> tuple[int, int, int, float, int]:
    row = (
        await db.execute(
            select(
                func.coalesce(func.sum(LlmUsageEvent.input_tokens), 0),
                func.coalesce(func.sum(LlmUsageEvent.output_tokens), 0),
                func.coalesce(func.sum(LlmUsageEvent.total_tokens), 0),
                func.coalesce(func.sum(LlmUsageEvent.estimated_cost_usd), 0),
                func.count(LlmUsageEvent.id),
            ).where(_base_filters(from_, to))
        )
    ).one()
    return int(row[0] or 0), int(row[1] or 0), int(row[2] or 0), _cost(row[3]), int(row[4] or 0)


async def _daily_cells(db: AsyncSession, from_: datetime, to: datetime) -> list[DailyCellOut]:
    day_expr = func.date(LlmUsageEvent.created_at)
    rows = (
        await db.execute(
            select(
                day_expr.label("day"),
                func.coalesce(func.sum(LlmUsageEvent.input_tokens), 0),
                func.coalesce(func.sum(LlmUsageEvent.output_tokens), 0),
                func.coalesce(func.sum(LlmUsageEvent.total_tokens), 0),
                func.coalesce(func.sum(LlmUsageEvent.estimated_cost_usd), 0),
                func.count(LlmUsageEvent.id),
            )
            .where(_base_filters(from_, to))
            .group_by(day_expr)
            .order_by(day_expr.asc())
        )
    ).all()
    cells: list[DailyCellOut] = []
    for row in rows:
        day = row[0]
        day_label = day.isoformat() if hasattr(day, "isoformat") else str(day)
        cells.append(
            DailyCellOut(
                date=day_label,
                input_tokens=int(row[1] or 0),
                output_tokens=int(row[2] or 0),
                total_tokens=int(row[3] or 0),
                estimated_cost_usd=_cost(row[4]),
                event_count=int(row[5] or 0),
            )
        )
    return cells


@router.get("/summary/", response_model=SummaryOut)
async def get_summary(
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = None,
    db: AsyncSession = Depends(get_db),
):
    current_from, current_to = _period_bounds(from_, to)
    duration = current_to - current_from
    prior_from = current_from - duration
    prior_to = current_from

    input_tokens, output_tokens, total_tokens, estimated_cost_usd, event_count = await _totals(
        db, current_from, current_to
    )
    (
        prior_input_tokens,
        prior_output_tokens,
        prior_total_tokens,
        prior_estimated_cost_usd,
        prior_event_count,
    ) = await _totals(db, prior_from, prior_to)

    by_source_rows = (
        await db.execute(
            select(
                LlmUsageEvent.source,
                func.coalesce(func.sum(LlmUsageEvent.total_tokens), 0),
                func.coalesce(func.sum(LlmUsageEvent.estimated_cost_usd), 0),
                func.count(LlmUsageEvent.id),
            )
            .where(_base_filters(current_from, current_to))
            .group_by(LlmUsageEvent.source)
        )
    ).all()
    by_source = {
        (source.value if hasattr(source, "value") else str(source)): AggregateBreakdown(
            tokens=int(tokens or 0),
            cost_usd=_cost(cost_usd),
            count=int(count or 0),
        )
        for source, tokens, cost_usd, count in by_source_rows
    }

    by_operation_rows = (
        await db.execute(
            select(
                LlmUsageEvent.operation,
                func.coalesce(func.sum(LlmUsageEvent.total_tokens), 0),
                func.coalesce(func.sum(LlmUsageEvent.estimated_cost_usd), 0),
                func.count(LlmUsageEvent.id),
            )
            .where(_base_filters(current_from, current_to))
            .group_by(LlmUsageEvent.operation)
        )
    ).all()
    by_operation = {
        (operation.value if hasattr(operation, "value") else str(operation)): AggregateBreakdown(
            tokens=int(tokens or 0),
            cost_usd=_cost(cost_usd),
            count=int(count or 0),
        )
        for operation, tokens, cost_usd, count in by_operation_rows
    }

    delta_tokens_pct = (
        ((total_tokens - prior_total_tokens) / prior_total_tokens) * 100 if prior_total_tokens else None
    )
    delta_cost_pct = (
        ((estimated_cost_usd - prior_estimated_cost_usd) / prior_estimated_cost_usd) * 100
        if prior_estimated_cost_usd
        else None
    )

    return SummaryOut(
        period=PeriodOut(from_=current_from, to=current_to),
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=total_tokens,
        estimated_cost_usd=estimated_cost_usd,
        event_count=event_count,
        by_source=by_source,
        by_operation=by_operation,
        prior_period=PriorPeriodOut(
            from_=prior_from,
            to=prior_to,
            input_tokens=prior_input_tokens,
            output_tokens=prior_output_tokens,
            total_tokens=prior_total_tokens,
            estimated_cost_usd=prior_estimated_cost_usd,
            event_count=prior_event_count,
            delta_tokens_pct=delta_tokens_pct,
            delta_cost_pct=delta_cost_pct,
        ),
    )


@router.get("/timeseries/", response_model=list[DailyCellOut])
async def get_timeseries(
    granularity: Literal["day"] = "day",
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = None,
    db: AsyncSession = Depends(get_db),
):
    if granularity != "day":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only granularity=day is supported")
    current_from, current_to = _period_bounds(from_, to)
    return await _daily_cells(db, current_from, current_to)


@router.get("/heatmap-daily/", response_model=list[DailyCellOut])
async def get_heatmap_daily(
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = None,
    db: AsyncSession = Depends(get_db),
):
    current_from, current_to = _period_bounds(from_, to)
    return await _daily_cells(db, current_from, current_to)


@router.get("/heatmap-hourly/", response_model=list[HourlyHeatmapCellOut])
async def get_heatmap_hourly(
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = None,
    db: AsyncSession = Depends(get_db),
):
    current_from, current_to = _period_bounds(from_, to)
    rows = (
        await db.execute(
            select(LlmUsageEvent.created_at, LlmUsageEvent.total_tokens).where(
                _base_filters(current_from, current_to)
            )
        )
    ).all()

    heatmap: dict[tuple[int, int], dict[str, int]] = {
        (dow, hour): {"total_tokens": 0, "event_count": 0}
        for dow in range(7)
        for hour in range(24)
    }
    for created_at, total_tokens in rows:
        created = _as_utc(created_at)
        if created is None:
            continue
        key = (created.weekday(), created.hour)
        heatmap[key]["total_tokens"] += int(total_tokens or 0)
        heatmap[key]["event_count"] += 1

    return [
        HourlyHeatmapCellOut(
            dow=dow,
            hour=hour,
            total_tokens=heatmap[(dow, hour)]["total_tokens"],
            event_count=heatmap[(dow, hour)]["event_count"],
        )
        for dow in range(7)
        for hour in range(24)
    ]


@router.get("/matrix/", response_model=list[MatrixRowOut])
async def get_matrix(
    group_by: Literal["workspace", "user"] = "workspace",
    limit: int = 10,
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = None,
    db: AsyncSession = Depends(get_db),
):
    current_from, current_to = _period_bounds(from_, to)
    limit = max(1, min(limit, 100))

    if group_by == "workspace":
        id_col = Workspace.id
        name_col = Workspace.name
        join_condition = LlmUsageEvent.workspace_id == Workspace.id
        group_id_col = LlmUsageEvent.workspace_id
    else:
        id_col = User.id
        name_col = User.display_name
        join_condition = LlmUsageEvent.user_id == User.id
        group_id_col = LlmUsageEvent.user_id

    top_rows = (
        await db.execute(
            select(
                id_col,
                name_col,
                func.coalesce(func.sum(LlmUsageEvent.total_tokens), 0),
                func.coalesce(func.sum(LlmUsageEvent.estimated_cost_usd), 0),
            )
            .join_from(LlmUsageEvent, Workspace if group_by == "workspace" else User, join_condition)
            .where(_base_filters(current_from, current_to))
            .group_by(id_col, name_col)
            .order_by(func.coalesce(func.sum(LlmUsageEvent.total_tokens), 0).desc(), name_col.asc())
            .limit(limit)
        )
    ).all()
    ids = [row[0] for row in top_rows]
    if not ids:
        return []

    day_end_date = _as_utc(current_to).date()
    day_start_date = day_end_date - timedelta(days=6)
    day_start = datetime.combine(day_start_date, time.min, tzinfo=timezone.utc)
    day_end = datetime.combine(day_end_date + timedelta(days=1), time.min, tzinfo=timezone.utc)
    day_expr = func.date(LlmUsageEvent.created_at)

    days_rows = (
        await db.execute(
            select(
                group_id_col,
                day_expr.label("day"),
                func.coalesce(func.sum(LlmUsageEvent.input_tokens), 0),
                func.coalesce(func.sum(LlmUsageEvent.output_tokens), 0),
                func.coalesce(func.sum(LlmUsageEvent.total_tokens), 0),
                func.coalesce(func.sum(LlmUsageEvent.estimated_cost_usd), 0),
                func.count(LlmUsageEvent.id),
            )
            .where(
                group_id_col.in_(ids),
                _base_filters(day_start, day_end),
            )
            .group_by(group_id_col, day_expr)
        )
    ).all()

    day_keys = [day_start_date + timedelta(days=idx) for idx in range(7)]
    by_group_day: dict[str, dict[str, MatrixDailyCellOut]] = {item_id: {} for item_id in ids}
    for item_id, day, input_t, output_t, total_t, cost_usd, count in days_rows:
        day_label = day.isoformat() if hasattr(day, "isoformat") else str(day)
        by_group_day[item_id][day_label] = MatrixDailyCellOut(
            date=day_label,
            total_tokens=int(total_t or 0),
            estimated_cost_usd=_cost(cost_usd),
            event_count=int(count or 0),
        )

    out: list[MatrixRowOut] = []
    for item_id, name, total_t, cost_usd in top_rows:
        days: list[MatrixDailyCellOut] = []
        for day_key in day_keys:
            label = day_key.isoformat()
            days.append(
                by_group_day[item_id].get(
                    label,
                    MatrixDailyCellOut(
                        date=label,
                        total_tokens=0,
                        estimated_cost_usd=0.0,
                        event_count=0,
                    ),
                )
            )
        out.append(
            MatrixRowOut(
                id=item_id,
                name=name,
                total_tokens=int(total_t or 0),
                estimated_cost_usd=_cost(cost_usd),
                days=days,
            )
        )
    return out


async def _ranked_usage_rows(
    db: AsyncSession,
    *,
    group_by: Literal["workspace", "user"],
    limit: int,
    from_: datetime,
    to: datetime,
) -> list[RankedUsageRowOut]:
    if group_by == "workspace":
        id_col = Workspace.id
        name_col = Workspace.name
        join_table = Workspace
        join_on = LlmUsageEvent.workspace_id == Workspace.id
    else:
        id_col = User.id
        name_col = User.display_name
        join_table = User
        join_on = LlmUsageEvent.user_id == User.id

    rows = (
        await db.execute(
            select(
                id_col,
                name_col,
                func.coalesce(func.sum(LlmUsageEvent.input_tokens), 0),
                func.coalesce(func.sum(LlmUsageEvent.output_tokens), 0),
                func.coalesce(func.sum(LlmUsageEvent.total_tokens), 0),
                func.coalesce(func.sum(LlmUsageEvent.estimated_cost_usd), 0),
                func.count(LlmUsageEvent.id),
            )
            .join_from(LlmUsageEvent, join_table, join_on)
            .where(_base_filters(from_, to))
            .group_by(id_col, name_col)
            .order_by(func.coalesce(func.sum(LlmUsageEvent.total_tokens), 0).desc(), name_col.asc())
            .limit(limit)
        )
    ).all()

    return [
        RankedUsageRowOut(
            id=row[0],
            name=row[1],
            input_tokens=int(row[2] or 0),
            output_tokens=int(row[3] or 0),
            total_tokens=int(row[4] or 0),
            estimated_cost_usd=_cost(row[5]),
            event_count=int(row[6] or 0),
        )
        for row in rows
    ]


@router.get("/by-workspace/", response_model=list[RankedUsageRowOut])
async def get_by_workspace(
    limit: int = 10,
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = None,
    db: AsyncSession = Depends(get_db),
):
    current_from, current_to = _period_bounds(from_, to)
    limit = max(1, min(limit, 100))
    return await _ranked_usage_rows(
        db,
        group_by="workspace",
        limit=limit,
        from_=current_from,
        to=current_to,
    )


@router.get("/by-user/", response_model=list[RankedUsageRowOut])
async def get_by_user(
    limit: int = 10,
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = None,
    db: AsyncSession = Depends(get_db),
):
    current_from, current_to = _period_bounds(from_, to)
    limit = max(1, min(limit, 100))
    return await _ranked_usage_rows(
        db,
        group_by="user",
        limit=limit,
        from_=current_from,
        to=current_to,
    )


@router.get("/events/", response_model=PaginatedEventsOut)
async def list_events(
    limit: int = 50,
    offset: int = 0,
    workspace_id: str | None = None,
    user_id: str | None = None,
    source: ELlmUsageSource | None = None,
    operation: ELlmUsageOperation | None = None,
    model: str | None = None,
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = None,
    db: AsyncSession = Depends(get_db),
):
    current_from, current_to = _period_bounds(from_, to)
    limit = max(1, min(limit, 200))
    offset = max(0, offset)

    filters = [_base_filters(current_from, current_to)]
    if workspace_id:
        filters.append(LlmUsageEvent.workspace_id == workspace_id)
    if user_id:
        filters.append(LlmUsageEvent.user_id == user_id)
    if source:
        filters.append(LlmUsageEvent.source == source)
    if operation:
        filters.append(LlmUsageEvent.operation == operation)
    if model:
        filters.append(LlmUsageEvent.model == model)

    total = int(
        (
            await db.execute(
                select(func.count(LlmUsageEvent.id)).where(*filters)
            )
        ).scalar()
        or 0
    )
    rows = (
        await db.execute(
            select(LlmUsageEvent, Workspace.name, User.display_name)
            .join(Workspace, Workspace.id == LlmUsageEvent.workspace_id)
            .join(User, User.id == LlmUsageEvent.user_id)
            .where(*filters)
            .order_by(LlmUsageEvent.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    items = [
        LlmUsageEventOut(
            id=event.id,
            created_at=event.created_at,
            workspace_id=event.workspace_id,
            workspace_name=workspace_name,
            user_id=event.user_id,
            user_display_name=user_display_name,
            source=event.source.value if hasattr(event.source, "value") else str(event.source),
            operation=event.operation.value if hasattr(event.operation, "value") else str(event.operation),
            model=event.model,
            input_tokens=int(event.input_tokens or 0),
            output_tokens=int(event.output_tokens or 0),
            total_tokens=int(event.total_tokens or 0),
            estimated_cost_usd=_cost(event.estimated_cost_usd),
            project_id=event.project_id,
            story_id=event.story_id,
            thread_id=event.thread_id,
        )
        for event, workspace_name, user_display_name in rows
    ]
    return PaginatedEventsOut(items=items, total=total, limit=limit, offset=offset)
