"""Forecast confidence scoring (GIN-335).

Turns delivery-data signals into a NO_DATA / LOW / MEDIUM / HIGH level plus
inspectable reason codes, so a forecast never arrives as a bare date the user has
to trust blindly. The rule is deterministic and threshold-based (documented below),
not a black box: it starts from what the completed-sample count can support, then
downgrades for each adverse signal (volatile throughput, churning scope, mostly
inferred history, too few active periods) and records why.

Pure and DB-agnostic — signals in, level+reasons out — so the boundaries are
property-testable without a database.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass
from enum import Enum

# Thresholds (deterministic, documented). Tuned conservative: it is better to say
# "Low" with reasons than to over-promise confidence on thin data.
MIN_COMPLETIONS_MEDIUM = 5
MIN_COMPLETIONS_HIGH = 12
MIN_ACTIVE_PERIODS = 3
HIGH_VOLATILITY_CV = 1.0  # throughput coefficient of variation above this is noisy
HIGH_SCOPE_CHURN = 0.30  # scope changed by >30% of current units in the window
HIGH_APPROXIMATE_SHARE = 0.5  # over half the history is inferred, not observed


class EConfidenceLevel(str, Enum):
    NO_DATA = "no_data"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


_ORDER = [EConfidenceLevel.NO_DATA, EConfidenceLevel.LOW, EConfidenceLevel.MEDIUM, EConfidenceLevel.HIGH]


@dataclass(frozen=True)
class ConfidenceSignals:
    completed_samples: int  # completions in the window
    active_periods: int  # periods that delivered at least one unit
    history_periods: int  # window length in periods
    throughput_cv: float  # coefficient of variation of per-period throughput
    scope_churn: float  # (created+cancelled+reopened in window) / current units
    approximate_share: float  # fraction of cycle samples inferred, not observed


@dataclass(frozen=True)
class ConfidenceResult:
    level: EConfidenceLevel
    reasons: tuple[str, ...]  # machine-readable codes; always populated below HIGH


def throughput_cv(per_period_counts: list[int]) -> float:
    """Coefficient of variation (stddev/mean) of throughput; 0 when mean is 0 or a
    single sample. Higher = noisier delivery, less trustworthy extrapolation."""
    if len(per_period_counts) < 2:
        return 0.0
    mean = statistics.fmean(per_period_counts)
    if mean == 0:
        return 0.0
    return statistics.pstdev(per_period_counts) / mean


def score_confidence(s: ConfidenceSignals) -> ConfidenceResult:
    if s.completed_samples <= 0:
        return ConfidenceResult(EConfidenceLevel.NO_DATA, ("no_completions",))

    reasons: list[str] = []

    # Cap by how much completed history exists.
    if s.completed_samples < MIN_COMPLETIONS_MEDIUM:
        cap = 1  # LOW
        reasons.append("insufficient_completions")
    elif s.completed_samples < MIN_COMPLETIONS_HIGH:
        cap = 2  # MEDIUM
        reasons.append("limited_history")
    else:
        cap = 3  # HIGH

    # Each adverse signal knocks the level down one and explains itself.
    downgrades = 0
    if s.throughput_cv > HIGH_VOLATILITY_CV:
        downgrades += 1
        reasons.append("high_volatility")
    if s.scope_churn > HIGH_SCOPE_CHURN:
        downgrades += 1
        reasons.append("unstable_scope")
    if s.approximate_share > HIGH_APPROXIMATE_SHARE:
        downgrades += 1
        reasons.append("approximate_history")
    if s.active_periods < MIN_ACTIVE_PERIODS:
        downgrades += 1
        reasons.append("sparse_history")

    idx = max(1, cap - downgrades)  # floored at LOW — there is *some* data
    return ConfidenceResult(_ORDER[idx], tuple(reasons))
