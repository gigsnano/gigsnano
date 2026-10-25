"""Forecast-snapshot persistence + calibration (GIN-335 slice 2).

`record_forecast_snapshot` writes the current Monte Carlo forecast to the history,
skipping the write when the output is unchanged from the latest row (idempotent —
event-triggered and scheduled recalcs never duplicate identical history).
`compute_calibration` pairs each retained snapshot with its actual completion
outcome and runs the pure `lib/calibration` analysis per algorithm version.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.lib.calibration import ForecastOutcome, calibration_report
from gigsnano_api.lib.delivery_history import EDeliveryEvent
from gigsnano_api.models import ForecastSnapshot, Project

from .schemas import CalibrationBandOut, CalibrationOut, CalibrationReportOut, SnapshotOut
from .service import _derive, compute_forecast, compute_health

# A project not recalculated within this window reads as stale (observability).
STALE_AFTER = timedelta(hours=24)


def _aware(dt: datetime | None) -> datetime | None:
    """Coerce a datetime read back from the store to UTC-aware. Postgres preserves
    tz; SQLite (test) strips it — normalize so comparisons never mix naive/aware."""
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _dedup_key(s: ForecastSnapshot) -> tuple:
    """Fields that define a materially different forecast. `calculated_at` is
    deliberately excluded — a recalc that produced the same bands is not new
    history, so re-running on unchanged data is idempotent."""
    return (
        s.algorithm_version,
        s.forecastable,
        s.remaining_units,
        s.confidence,
        s.data_quality,
        s.p50_date,
        s.p85_date,
        s.p95_date,
        s.health_status,
        s.forecast_vs_target,
    )


async def _latest_snapshot(db: AsyncSession, project_id: str) -> ForecastSnapshot | None:
    return (
        await db.execute(
            select(ForecastSnapshot)
            .where(ForecastSnapshot.project_id == project_id)
            .order_by(ForecastSnapshot.calculated_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def record_forecast_snapshot(
    db: AsyncSession,
    project: Project,
    *,
    now: datetime,
    period_days: int = 7,
    window_periods: int = 12,
    trials: int = 5000,
) -> tuple[ForecastSnapshot, bool]:
    """Compute the current forecast and append it to the history, unless the newest
    existing snapshot has identical output (then it's returned unchanged). Returns
    (snapshot, created). Caller owns the commit."""
    fc = await compute_forecast(
        db, project, now=now, period_days=period_days, window_periods=window_periods, trials=trials
    )
    health = await compute_health(
        db, project, now=now, period_days=period_days, window_periods=window_periods, trials=trials
    )
    candidate = ForecastSnapshot(
        project_id=project.id,
        calculated_at=now,
        algorithm_version=fc.algorithm_version,
        forecastable=fc.forecastable,
        remaining_units=fc.remaining_units,
        confidence=fc.confidence,
        data_quality=fc.data_quality,
        p50_periods=fc.p50_periods,
        p85_periods=fc.p85_periods,
        p95_periods=fc.p95_periods,
        p50_date=fc.p50_date,
        p85_date=fc.p85_date,
        p95_date=fc.p95_date,
        health_status=health.status,
        forecast_vs_target=health.forecast_vs_target,
        inputs={
            "period_days": fc.period_days,
            "trials": fc.trials,
            "sample_periods": fc.sample_periods,
            "remaining_units": fc.remaining_units,
        },
    )
    latest = await _latest_snapshot(db, project.id)
    if latest is not None and _dedup_key(latest) == _dedup_key(candidate):
        return latest, False
    db.add(candidate)
    await db.flush()
    return candidate, True


def _pair_outcomes(
    snapshots: list[ForecastSnapshot], completions: list[datetime]
) -> list[ForecastOutcome]:
    """Pair each forecastable snapshot with its actual outcome. A snapshot forecast
    that `remaining_units` more units would complete; its outcome is the date of the
    N-th completion strictly after it was calculated (None while still short of N —
    the forecast hasn't resolved yet). `completions` must be sorted ascending."""
    outcomes: list[ForecastOutcome] = []
    for s in snapshots:
        if (
            not s.forecastable
            or s.p50_date is None
            or s.p85_date is None
            or s.p95_date is None
            or s.remaining_units <= 0
        ):
            continue
        calc_at = _aware(s.calculated_at)
        later = [c for c in completions if c > calc_at]
        actual = later[s.remaining_units - 1] if len(later) >= s.remaining_units else None
        outcomes.append(
            ForecastOutcome(
                algorithm_version=s.algorithm_version,
                p50_date=_aware(s.p50_date),
                p85_date=_aware(s.p85_date),
                p95_date=_aware(s.p95_date),
                actual_completion=actual,
            )
        )
    return outcomes


async def compute_calibration(
    db: AsyncSession, project: Project, *, now: datetime, tolerance: float = 0.15
) -> CalibrationOut:
    """Coverage of past P50/P85/P95 forecasts vs actual completions, per algorithm
    version, plus staleness observability."""
    rows = list(
        (
            await db.execute(
                select(ForecastSnapshot)
                .where(ForecastSnapshot.project_id == project.id)
                .order_by(ForecastSnapshot.calculated_at.asc())
            )
        )
        .scalars()
        .all()
    )
    _, events, units = await _derive(db, project)
    completions = sorted(
        e.at for e in events if e.kind == EDeliveryEvent.COMPLETED and e.story_id in units
    )
    outcomes = _pair_outcomes(rows, completions)
    versions = sorted({o.algorithm_version for o in outcomes})
    reports = [
        CalibrationReportOut(
            algorithm_version=rep.algorithm_version,
            resolved_samples=rep.resolved_samples,
            bands=[
                CalibrationBandOut(
                    band=band.band,
                    expected=band.expected,
                    observed=band.observed,
                    resolved_samples=band.resolved_samples,
                    gap=band.gap,
                    miscalibrated=band.miscalibrated,
                )
                for band in rep.bands
            ],
        )
        for v in versions
        for rep in [calibration_report(outcomes, algorithm_version=v, tolerance=tolerance)]
    ]
    last = _aware(rows[-1].calculated_at) if rows else None
    stale = bool(last is not None and (now - last) > STALE_AFTER)
    return CalibrationOut(
        project_id=project.id,
        snapshot_count=len(rows),
        last_calculated_at=last,
        stale=stale,
        generated_at=now,
        reports=reports,
    )


def snapshot_out(snap: ForecastSnapshot, created: bool) -> SnapshotOut:
    return SnapshotOut(
        id=snap.id,
        project_id=snap.project_id,
        calculated_at=snap.calculated_at,
        algorithm_version=snap.algorithm_version,
        forecastable=snap.forecastable,
        remaining_units=snap.remaining_units,
        confidence=snap.confidence,
        data_quality=snap.data_quality,
        p50_date=snap.p50_date,
        p85_date=snap.p85_date,
        p95_date=snap.p95_date,
        created=created,
    )
