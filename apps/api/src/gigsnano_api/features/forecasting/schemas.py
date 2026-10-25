"""Wire shapes for the delivery-metrics read API (GIN-333). These aggregates are
the input GIN-334's probabilistic forecaster consumes; raw event evidence stays
derivable in the pure layer (`lib/delivery_history`)."""

from datetime import datetime

from pydantic import BaseModel


class ThroughputBucketOut(BaseModel):
    period_start: datetime
    period_end: datetime
    completed: int


class CycleTimeOut(BaseModel):
    samples: int
    p50_days: float | None
    p85_days: float | None
    # "exact" (all samples from observed start→done), "approximate" (some inferred),
    # or "none" (no completed work yet). Never implies more precision than the data.
    confidence: str


class ScopeOut(BaseModel):
    total: int
    remaining: int
    delivered: int
    cancelled: int


class DeliveryMetricsOut(BaseModel):
    project_id: str
    period_days: int
    generated_at: datetime
    throughput: list[ThroughputBucketOut]
    cycle_time: CycleTimeOut
    scope: ScopeOut
    # Honest data-quality signal so the UI shows "No data"/"Low confidence" instead
    # of a fabricated forecast: "no_data" (no completions), "low_data" (< LOW_DATA
    # completions), or "ok". `approximate_share` is the fraction of cycle samples
    # inferred from pre-log state rather than observed transitions.
    data_quality: str
    approximate_share: float


class ForecastOut(BaseModel):
    """Monte Carlo completion forecast (GIN-334). When `forecastable` is false the
    dates are null and `reason` says why — never a fabricated date. `*_periods` is
    the whole-period count behind each date; `algorithm_version` makes results
    reproducible/auditable."""

    forecastable: bool
    reason: str | None
    # How much to trust the forecast (GIN-335): "no_data" | "low" | "medium" | "high",
    # with machine-readable reason codes (e.g. insufficient_completions, high_volatility,
    # unstable_scope, approximate_history) so confidence is always inspectable.
    confidence: str
    confidence_reasons: list[str]
    algorithm_version: str
    remaining_units: int
    sample_periods: int
    trials: int
    period_days: int
    p50_periods: int | None
    p85_periods: int | None
    p95_periods: int | None
    p50_date: datetime | None
    p85_date: datetime | None
    p95_date: datetime | None
    data_quality: str
    generated_at: datetime


class SnapshotOut(BaseModel):
    """A persisted forecast snapshot (GIN-335 s2). `created` says whether this
    recalc appended a new history row or was idempotently skipped (unchanged)."""

    id: str
    project_id: str
    calculated_at: datetime
    algorithm_version: str
    forecastable: bool
    remaining_units: int
    confidence: str
    data_quality: str
    p50_date: datetime | None
    p85_date: datetime | None
    p95_date: datetime | None
    created: bool


class CalibrationBandOut(BaseModel):
    band: str  # "p50" | "p85" | "p95"
    expected: float
    observed: float
    resolved_samples: int
    gap: float  # observed - expected; negative = optimistic, positive = conservative
    miscalibrated: bool


class CalibrationReportOut(BaseModel):
    algorithm_version: str
    resolved_samples: int
    bands: list[CalibrationBandOut]


class CalibrationOut(BaseModel):
    """Whether past P50/P85/P95 forecasts met their expected coverage, per algorithm
    version, plus staleness observability (GIN-335 s2)."""

    project_id: str
    snapshot_count: int
    last_calculated_at: datetime | None
    stale: bool
    generated_at: datetime
    reports: list[CalibrationReportOut]


class HealthReasonOut(BaseModel):
    code: str
    explanation: str
    metric: float | int | str | None
    contributing_ids: list[str]


class RecommendationOut(BaseModel):
    """A recovery recommendation (GIN-339): advisory only, cites evidence + impact
    as a range, never mutates work."""

    action: str
    title: str
    rationale: str
    assumption: str
    decision_needed: str
    impact: str
    contributing_ids: list[str]


class HealthOut(BaseModel):
    """Explainable system health (GIN-336): status + ordered evidence + recovery
    recommendations (GIN-339). Reasons/recs carry contributing work-item ids for
    drill-down; `rules_version` keeps a stored snapshot interpretable after
    thresholds change."""

    status: str  # "no_data" | "on_track" | "at_risk" | "off_track"
    reasons: list[HealthReasonOut]
    recommendations: list[RecommendationOut]
    rules_version: str
    recovery_version: str
    confidence: str
    forecast_vs_target: str | None
    remaining_units: int
    generated_at: datetime
