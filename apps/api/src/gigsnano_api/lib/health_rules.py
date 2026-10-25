"""Explainable project-health rules (GIN-336).

Turns delivery evidence into ON_TRACK / AT_RISK / OFF_TRACK / NO_DATA — never an
opaque score. Each contributing signal (forecast-vs-target, overdue work, critical
blockers, scope growth, reopen trend) proposes a status and carries its own reason:
a machine code, a human explanation, the metric value, and the contributing
work-item ids for drill-down. Final status is the worst proposal, and every
non-NO_DATA status is backed by at least one reason (AC: evidence or No data).

Rules are versioned (`HEALTH_RULES_VERSION`) and threshold-driven so the same
inputs always reproduce the same status/reasons, and a stored snapshot stays
interpretable after the thresholds change. This module is pure — evidence in,
result out — so precedence and thresholds are unit-testable without a database.

Deliberately free of project mode/unit language (items vs points vs hours): the
service shapes those into the neutral signals below before calling in.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

HEALTH_RULES_VERSION = "health-rules-v1"


class EHealthStatus(str, Enum):
    NO_DATA = "no_data"
    ON_TRACK = "on_track"
    AT_RISK = "at_risk"
    OFF_TRACK = "off_track"


# Severity ordering among the "has-data" statuses; final status is the worst.
_SEVERITY = {EHealthStatus.ON_TRACK: 1, EHealthStatus.AT_RISK: 2, EHealthStatus.OFF_TRACK: 3}

# Confidence levels too weak to assert green on their own.
_WEAK_CONFIDENCE = {"low", "no_data"}


@dataclass(frozen=True)
class HealthThresholds:
    # Share of remaining units overdue/blocked above which the signal is OFF_TRACK
    # rather than AT_RISK.
    overdue_off_share: float = 0.25
    blocked_off_share: float = 0.25
    scope_growth_at_risk: float = 0.30  # churn ratio over the window
    reopen_at_risk: int = 2  # reopens over the window


DEFAULT_THRESHOLDS = HealthThresholds()


@dataclass(frozen=True)
class HealthEvidence:
    """Neutral, pre-computed signals for one project (the service derives these
    from delivery history, the forecast and the work items)."""

    forecastable: bool
    confidence: str  # "no_data" | "low" | "medium" | "high"
    # "on" | "at_risk" | "off" | None (no target set, or not forecastable)
    forecast_vs_target: str | None
    remaining_units: int
    overdue_ids: tuple[str, ...] = ()  # past target date, not done
    blocked_ids: tuple[str, ...] = ()  # blocked by open work
    reopened_count: int = 0  # reopens in the window
    scope_growth: float = 0.0  # churn ratio in the window


@dataclass(frozen=True)
class HealthReason:
    code: str
    explanation: str
    metric: float | int | str | None
    contributing_ids: tuple[str, ...] = ()


@dataclass(frozen=True)
class HealthResult:
    status: EHealthStatus
    reasons: tuple[HealthReason, ...]  # ordered most-severe first
    rules_version: str


def _share_status(count: int, remaining: int, off_share: float) -> EHealthStatus:
    if remaining > 0 and count / remaining > off_share:
        return EHealthStatus.OFF_TRACK
    return EHealthStatus.AT_RISK


def score_health(
    ev: HealthEvidence, *, thresholds: HealthThresholds = DEFAULT_THRESHOLDS
) -> HealthResult:
    proposals: list[tuple[EHealthStatus, HealthReason]] = []

    if ev.forecast_vs_target == "on":
        proposals.append(
            (EHealthStatus.ON_TRACK, HealthReason("forecast_meets_target", "The 85% forecast lands on or before the target date.", None))
        )
    elif ev.forecast_vs_target == "at_risk":
        proposals.append(
            (EHealthStatus.AT_RISK, HealthReason("target_between_p50_p85", "The target falls between the 50% and 85% forecast.", None))
        )
    elif ev.forecast_vs_target == "off":
        proposals.append(
            (EHealthStatus.OFF_TRACK, HealthReason("forecast_misses_target", "The target is earlier than the 50% forecast.", None))
        )

    if ev.overdue_ids:
        n = len(ev.overdue_ids)
        proposals.append(
            (_share_status(n, ev.remaining_units, thresholds.overdue_off_share),
             HealthReason("overdue_work", f"{n} item(s) are past their target date.", n, ev.overdue_ids))
        )

    if ev.blocked_ids:
        # Critical blockers elevate health independently of forecast progress.
        n = len(ev.blocked_ids)
        proposals.append(
            (_share_status(n, ev.remaining_units, thresholds.blocked_off_share),
             HealthReason("critical_blockers", f"{n} item(s) are blocked by open work.", n, ev.blocked_ids))
        )

    if ev.scope_growth > thresholds.scope_growth_at_risk:
        proposals.append(
            (EHealthStatus.AT_RISK, HealthReason("scope_growth", "Scope has grown materially in the recent window.", round(ev.scope_growth, 2)))
        )

    if ev.reopened_count > thresholds.reopen_at_risk:
        proposals.append(
            (EHealthStatus.AT_RISK, HealthReason("reopen_trend", f"{ev.reopened_count} item(s) were reopened recently.", ev.reopened_count))
        )

    if not proposals:
        # No signal at all. Distinguish "have a forecast but no target to judge it"
        # from "not enough data to forecast" — both are No data, different reasons.
        code = "no_target" if ev.forecastable else "no_data"
        explanation = (
            "Set a target date to assess whether delivery is on track."
            if ev.forecastable
            else "Not enough completed work yet to assess project health."
        )
        return HealthResult(EHealthStatus.NO_DATA, (HealthReason(code, explanation, None),), HEALTH_RULES_VERSION)

    worst = max((s for s, _ in proposals), key=lambda s: _SEVERITY[s])

    # A low-confidence forecast cannot assert green on its own.
    if worst == EHealthStatus.ON_TRACK and ev.confidence in _WEAK_CONFIDENCE:
        worst = EHealthStatus.AT_RISK
        proposals.append(
            (EHealthStatus.AT_RISK, HealthReason("low_confidence", "Forecast confidence is low, so On track can't be asserted.", ev.confidence))
        )

    ordered = [r for _, r in sorted(proposals, key=lambda p: -_SEVERITY[p[0]])]
    return HealthResult(worst, tuple(ordered), HEALTH_RULES_VERSION)
