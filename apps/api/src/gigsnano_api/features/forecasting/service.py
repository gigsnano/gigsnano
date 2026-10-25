"""Bind the pure delivery-history core (`lib/delivery_history`) to project data.

Reads the project's stories + their `story_activities`, reduces them to the
core's plain inputs, and assembles queryable aggregates (throughput series,
cycle-time percentiles, scope) plus the Monte Carlo completion forecast. The
statistical math lives in the pure libs (`lib/delivery_history`, `lib/forecasting`);
this layer only binds recorded history to them and shapes the wire response.

Note (GIN-333 follow-up): the story query rides the global soft-delete filter, so
trashed/cancelled work is excluded here and `scope.cancelled` reads 0. The core
already models cancellation; a trash-inclusive query lands with the scope-baseline
snapshot work.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from gigsnano_api.lib.confidence import (
    ConfidenceResult,
    ConfidenceSignals,
    score_confidence,
    throughput_cv,
)
from gigsnano_api.lib.delivery_history import (
    DeliveryEvent,
    EConfidence,
    EDeliveryEvent,
    RawActivity,
    StorySnapshot,
    cycle_times,
    derive_events,
    execution_unit_ids,
    scope_state,
    throughput,
)
from gigsnano_api.lib.forecasting import ForecastResult, forecast_completion
from gigsnano_api.lib.health_rules import HealthEvidence, score_health
from gigsnano_api.lib.recovery import RECOVERY_VERSION, recommend
from gigsnano_api.models import (
    EStoryRelationType,
    EStoryStatus,
    Project,
    Story,
    StoryActivity,
    StoryRelation,
)

from .schemas import (
    CycleTimeOut,
    DeliveryMetricsOut,
    ForecastOut,
    HealthOut,
    HealthReasonOut,
    RecommendationOut,
    ScopeOut,
    ThroughputBucketOut,
)

_SCOPE_CHURN_KINDS = {EDeliveryEvent.CREATED, EDeliveryEvent.CANCELLED, EDeliveryEvent.REOPENED}

LOW_DATA_COMPLETIONS = 5  # below this, forecasts are "low confidence", not precise


def _percentile(values: list[float], q: float) -> float | None:
    """Nearest-rank percentile of an unsorted list (q in [0,1]); None if empty."""
    if not values:
        return None
    ordered = sorted(values)
    idx = min(len(ordered) - 1, int(q * len(ordered)))
    return round(ordered[idx], 2)


def _data_quality(completions: int) -> str:
    if completions == 0:
        return "no_data"
    return "low_data" if completions < LOW_DATA_COMPLETIONS else "ok"


async def _derive(
    db: AsyncSession, project: Project
) -> tuple[list[StorySnapshot], list[DeliveryEvent], set[str]]:
    """Shared delivery-history derivation (GIN-333) — one query pass, reused by the
    metrics and forecast endpoints."""
    stories = (
        (await db.execute(select(Story).where(Story.project_id == project.id))).scalars().all()
    )
    parent_ids = {s.parent_id for s in stories if s.parent_id}
    snaps = [
        StorySnapshot(
            id=s.id,
            parent_id=s.parent_id,
            status=s.status.value,
            created_at=s.created_at,
            updated_at=s.updated_at,
            has_children=s.id in parent_ids,
            cancelled_at=s.deleted_at,
        )
        for s in stories
    ]

    story_ids = [s.id for s in stories]
    act_rows = (
        (
            await db.execute(
                select(StoryActivity).where(StoryActivity.story_id.in_(story_ids))
            )
        )
        .scalars()
        .all()
        if story_ids
        else []
    )
    activities = [
        RawActivity(
            story_id=a.story_id,
            field=a.field.value if a.field is not None else "",
            old_value=a.old_value,
            new_value=a.new_value,
            at=a.created_at,
        )
        for a in act_rows
    ]
    events = derive_events(activities, snaps)
    return snaps, events, execution_unit_ids(snaps)


async def compute_delivery_metrics(
    db: AsyncSession,
    project: Project,
    *,
    now: datetime,
    period_days: int = 7,
    periods: int = 12,
) -> DeliveryMetricsOut:
    snaps, events, units = await _derive(db, project)

    buckets = throughput(events, units, now=now, periods=periods, period_days=period_days)
    samples = cycle_times(events, units)
    scope = scope_state(snaps)

    days = [s.days for s in samples]
    completions = sum(b.completed for b in buckets)
    approx = sum(1 for s in samples if s.confidence == EConfidence.APPROXIMATE)
    if not samples:
        cyc_conf = "none"
    elif approx == 0:
        cyc_conf = "exact"
    else:
        cyc_conf = "approximate"

    quality = _data_quality(completions)

    return DeliveryMetricsOut(
        project_id=project.id,
        period_days=period_days,
        generated_at=now,
        throughput=[
            ThroughputBucketOut(period_start=b.period_start, period_end=b.period_end, completed=b.completed)
            for b in buckets
        ],
        cycle_time=CycleTimeOut(
            samples=len(samples),
            p50_days=_percentile(days, 0.5),
            p85_days=_percentile(days, 0.85),
            confidence=cyc_conf,
        ),
        scope=ScopeOut(
            total=scope.total, remaining=scope.remaining, delivered=scope.delivered, cancelled=scope.cancelled
        ),
        data_quality=quality,
        approximate_share=round(approx / len(samples), 3) if samples else 0.0,
    )


class _Bundle:
    """Forecast + confidence + churn/reopen signals from one derivation pass —
    shared by the forecast and health endpoints so they never disagree."""

    def __init__(
        self,
        result: ForecastResult,
        confidence: ConfidenceResult,
        completions: int,
        scope_churn: float,
        reopened: int,
    ):
        self.result = result
        self.confidence = confidence
        self.completions = completions
        self.scope_churn = scope_churn
        self.reopened = reopened


def _forecast_bundle(
    snaps: list[StorySnapshot],
    events: list[DeliveryEvent],
    units: set[str],
    *,
    now: datetime,
    period_days: int,
    window_periods: int,
    trials: int,
) -> _Bundle:
    buckets = throughput(events, units, now=now, periods=window_periods, period_days=period_days)
    samples = [b.completed for b in buckets]
    remaining = scope_state(snaps).remaining
    result = forecast_completion(samples, remaining, now=now, period_days=period_days, trials=trials)

    cyc = cycle_times(events, units)
    approx_share = (
        sum(1 for s in cyc if s.confidence == EConfidence.APPROXIMATE) / len(cyc) if cyc else 0.0
    )
    leaf_ids = {s.id for s in snaps if not s.has_children}
    window_start = now - timedelta(days=period_days * window_periods)
    churn_events = sum(
        1
        for e in events
        if e.kind in _SCOPE_CHURN_KINDS and e.story_id in leaf_ids and e.at > window_start
    )
    reopened = sum(
        1 for e in events if e.kind == EDeliveryEvent.REOPENED and e.at > window_start
    )
    scope_churn = churn_events / max(1, len(units))
    confidence = score_confidence(
        ConfidenceSignals(
            completed_samples=sum(samples),
            active_periods=sum(1 for c in samples if c > 0),
            history_periods=len(samples),
            throughput_cv=throughput_cv(samples),
            scope_churn=scope_churn,
            approximate_share=approx_share,
        )
    )
    return _Bundle(result, confidence, sum(samples), scope_churn, reopened)


async def compute_forecast(
    db: AsyncSession,
    project: Project,
    *,
    now: datetime,
    period_days: int = 7,
    window_periods: int = 12,
    trials: int = 5000,
) -> ForecastOut:
    """Monte Carlo completion forecast (GIN-334) from the project's recent
    throughput window against its remaining execution units. Estimate-free:
    remaining is a unit count, never points/hours."""
    snaps, events, units = await _derive(db, project)
    b = _forecast_bundle(
        snaps, events, units, now=now, period_days=period_days, window_periods=window_periods, trials=trials
    )
    r = b.result
    return ForecastOut(
        confidence=b.confidence.level.value,
        confidence_reasons=list(b.confidence.reasons),
        forecastable=r.forecastable,
        reason=r.reason,
        algorithm_version=r.algorithm_version,
        remaining_units=r.remaining_units,
        sample_periods=r.sample_periods,
        trials=r.trials,
        period_days=r.period_days,
        p50_periods=r.p50_periods,
        p85_periods=r.p85_periods,
        p95_periods=r.p95_periods,
        p50_date=r.p50_date,
        p85_date=r.p85_date,
        p95_date=r.p95_date,
        data_quality=_data_quality(b.completions),
        generated_at=now,
    )


def _forecast_vs_target(result: ForecastResult, target_date) -> str | None:
    """"on"/"at_risk"/"off" comparing the forecast to the target date, or None when
    there's no target or no forecast to compare."""
    if not result.forecastable or result.p50_date is None or result.p85_date is None or target_date is None:
        return None
    if result.p85_date.date() <= target_date:
        return "on"
    if result.p50_date.date() <= target_date:
        return "at_risk"
    return "off"


async def _overdue_ids(db: AsyncSession, project: Project, now: datetime) -> list[str]:
    """Non-done work items whose target date is already past (soft-deleted excluded
    by the global filter)."""
    rows = await db.execute(
        select(Story.id).where(
            Story.project_id == project.id,
            Story.target_date.is_not(None),
            Story.target_date < now.date(),
            Story.status != EStoryStatus.DONE,
        )
    )
    return sorted(r[0] for r in rows.all())


async def _blocked_ids(db: AsyncSession, project: Project) -> list[str]:
    """Non-done work items that are `blocked_by` a still-open blocker — a critical
    dependency signal independent of the forecast."""
    blocker = aliased(Story)
    rows = await db.execute(
        select(StoryRelation.story_id)
        .join(Story, Story.id == StoryRelation.story_id)
        .join(blocker, blocker.id == StoryRelation.related_story_id)
        .where(
            Story.project_id == project.id,
            StoryRelation.relation_type == EStoryRelationType.BLOCKED_BY,
            Story.status != EStoryStatus.DONE,
            blocker.status != EStoryStatus.DONE,
        )
    )
    return sorted({r[0] for r in rows.all()})


async def compute_health(
    db: AsyncSession,
    project: Project,
    *,
    now: datetime,
    period_days: int = 7,
    window_periods: int = 12,
    trials: int = 5000,
) -> HealthOut:
    """Explainable system health (GIN-336): forecast-vs-target + overdue + blocked +
    scope/reopen signals → status + ordered evidence with drill-down ids."""
    snaps, events, units = await _derive(db, project)
    b = _forecast_bundle(
        snaps, events, units, now=now, period_days=period_days, window_periods=window_periods, trials=trials
    )
    fvt = _forecast_vs_target(b.result, project.target_date)
    overdue = await _overdue_ids(db, project, now)
    blocked = await _blocked_ids(db, project)

    evidence = HealthEvidence(
        forecastable=b.result.forecastable,
        confidence=b.confidence.level.value,
        forecast_vs_target=fvt,
        remaining_units=b.result.remaining_units,
        overdue_ids=tuple(overdue),
        blocked_ids=tuple(blocked),
        reopened_count=b.reopened,
        # Scope "growth" needs a delivery baseline to grow against — a brand-new
        # project's initial backlog is not growth. Only signal it once there's
        # enough history to forecast.
        scope_growth=b.scope_churn if b.result.forecastable else 0.0,
    )
    health = score_health(evidence)
    recs = recommend(evidence)
    return HealthOut(
        status=health.status.value,
        reasons=[
            HealthReasonOut(
                code=r.code,
                explanation=r.explanation,
                metric=r.metric,
                contributing_ids=list(r.contributing_ids),
            )
            for r in health.reasons
        ],
        recommendations=[
            RecommendationOut(
                action=rec.action,
                title=rec.title,
                rationale=rec.rationale,
                assumption=rec.assumption,
                decision_needed=rec.decision_needed,
                impact=rec.impact,
                contributing_ids=list(rec.contributing_ids),
            )
            for rec in recs
        ],
        rules_version=health.rules_version,
        recovery_version=RECOVERY_VERSION,
        confidence=b.confidence.level.value,
        forecast_vs_target=fvt,
        remaining_units=b.result.remaining_units,
        generated_at=now,
    )
