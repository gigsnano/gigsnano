"""Persisted forecast snapshots (GIN-335 slice 2).

Each row is one Monte Carlo forecast computation for a project: the inputs it ran
on, the probability bands it produced, the algorithm version, and the calculation
timestamp. Retaining these lets us (a) reproduce an earlier result, and (b)
calibrate — compare past P50/P85/P95 forecasts against what actually happened
(`lib/calibration`). Append-only history; a recalc with unchanged output is
skipped so identical results never duplicate the history (idempotency).
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import JSON_DOC, TimestampedBase


class ForecastSnapshot(TimestampedBase):
    __tablename__ = "forecast_snapshots"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    # The `now` the forecast was computed against — the point in time the bands
    # were "as of". Explicit (not created_at) so calibration attributes outcomes
    # deterministically and tests can control it.
    calculated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    algorithm_version: Mapped[str] = mapped_column(String(40))
    forecastable: Mapped[bool] = mapped_column(Boolean, default=False)
    remaining_units: Mapped[int] = mapped_column(Integer, default=0)
    confidence: Mapped[str] = mapped_column(String(20))
    data_quality: Mapped[str] = mapped_column(String(20))
    # Whole-period counts behind each band (reproducibility), null when not forecastable.
    p50_periods: Mapped[int | None] = mapped_column(Integer, default=None)
    p85_periods: Mapped[int | None] = mapped_column(Integer, default=None)
    p95_periods: Mapped[int | None] = mapped_column(Integer, default=None)
    p50_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    p85_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    p95_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    # System health at snapshot time (GIN-339) — compared to the prior snapshot to
    # detect a material change worth alerting on. Nullable: older rows predate them.
    health_status: Mapped[str | None] = mapped_column(String(20), default=None)
    forecast_vs_target: Mapped[str | None] = mapped_column(String(20), default=None)
    # The throughput samples + params the forecast ran on — enough to re-run it.
    inputs: Mapped[dict] = mapped_column(JSON_DOC, default=dict)
