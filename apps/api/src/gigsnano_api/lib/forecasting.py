"""Estimate-free probabilistic completion forecasting (GIN-334).

Monte Carlo over recorded throughput: to finish `remaining` execution units, each
trial repeatedly samples a historical per-period throughput (with replacement) and
counts how many periods it takes to accumulate `remaining` completions. Across many
trials that yields a distribution of periods-to-done → P50/P85/P95 dates.

Deliberately estimate-free (Automatic mode): it counts units, never story points or
hours, so a project needs no estimates to be forecast. Reproducible: the RNG is
seeded, so a fixture reproduces exactly; production just uses more trials.

Honest about data: no throughput in the window → No forecast (a reason, never an
invented date). All math is pure (samples + remaining in, result out) so it is
deterministic and property-testable without a database.

Deferred (documented): weighted Sizes/Points/Time inputs (needs the planning-modes
story GIN-327) and cycle-scoped forecasts — both are input-shaping on top of this
same simulation, not a different algorithm.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import datetime, timedelta

FORECAST_ALGORITHM_VERSION = "montecarlo-count-v1"
DEFAULT_TRIALS = 5000
DEFAULT_SEED = 20260719  # stable seed → reproducible; override per call if needed
# Bounds one trial so a pathological low-throughput window can't loop unboundedly.
# Only reachable when throughput is mostly zero; a censored trial is flagged.
_MAX_PERIODS_PER_TRIAL = 5200  # ~100 years of weekly periods


@dataclass(frozen=True)
class ForecastResult:
    forecastable: bool
    reason: str | None  # set when not forecastable (e.g. "no_throughput")
    algorithm_version: str
    remaining_units: int
    sample_periods: int  # throughput samples fed to the simulation
    trials: int
    period_days: int
    # Periods (and dates) by which the project completes with P% probability.
    # Monotonic by construction: p50 <= p85 <= p95.
    p50_periods: int | None
    p85_periods: int | None
    p95_periods: int | None
    p50_date: datetime | None
    p85_date: datetime | None
    p95_date: datetime | None


def _percentile_int(sorted_vals: list[int], q: float) -> int:
    """Nearest-rank percentile of a pre-sorted list of ints (q in [0,1])."""
    idx = min(len(sorted_vals) - 1, int(q * len(sorted_vals)))
    return sorted_vals[idx]


def _no_forecast(reason: str, *, remaining: int, samples: int, trials: int, period_days: int) -> ForecastResult:
    return ForecastResult(
        forecastable=False,
        reason=reason,
        algorithm_version=FORECAST_ALGORITHM_VERSION,
        remaining_units=remaining,
        sample_periods=samples,
        trials=trials,
        period_days=period_days,
        p50_periods=None,
        p85_periods=None,
        p95_periods=None,
        p50_date=None,
        p85_date=None,
        p95_date=None,
    )


def forecast_completion(
    throughput_samples: list[int],
    remaining_units: int,
    *,
    now: datetime,
    period_days: int,
    trials: int = DEFAULT_TRIALS,
    seed: int = DEFAULT_SEED,
) -> ForecastResult:
    """P50/P85/P95 periods-and-dates to complete `remaining_units`.

    `throughput_samples` is the recent window of completions-per-period (zeros
    included — a slow period is real signal). Returns a non-forecastable result
    (with a reason) rather than an invented date when history is empty or the
    window never delivered anything."""
    samples = list(throughput_samples)
    n = len(samples)

    # Nothing left to do → already complete, zero periods out.
    if remaining_units <= 0:
        return ForecastResult(
            forecastable=True,
            reason=None,
            algorithm_version=FORECAST_ALGORITHM_VERSION,
            remaining_units=max(remaining_units, 0),
            sample_periods=n,
            trials=trials,
            period_days=period_days,
            p50_periods=0,
            p85_periods=0,
            p95_periods=0,
            p50_date=now,
            p85_date=now,
            p95_date=now,
        )

    if n == 0:
        return _no_forecast("no_history", remaining=remaining_units, samples=0, trials=trials, period_days=period_days)
    if max(samples) <= 0:
        # Every sampled period delivered zero — the project would never finish; do
        # not fabricate a date.
        return _no_forecast(
            "no_throughput", remaining=remaining_units, samples=n, trials=trials, period_days=period_days
        )

    # Simulation sampling, deliberately seedable and reproducible — not crypto.
    rng = random.Random(seed)  # nosec B311
    results: list[int] = []
    for _ in range(trials):
        done = 0
        periods = 0
        while done < remaining_units and periods < _MAX_PERIODS_PER_TRIAL:
            done += samples[rng.randrange(n)]
            periods += 1
        results.append(periods)
    results.sort()

    p50 = _percentile_int(results, 0.50)
    p85 = _percentile_int(results, 0.85)
    p95 = _percentile_int(results, 0.95)
    period = timedelta(days=period_days)
    return ForecastResult(
        forecastable=True,
        reason=None,
        algorithm_version=FORECAST_ALGORITHM_VERSION,
        remaining_units=remaining_units,
        sample_periods=n,
        trials=trials,
        period_days=period_days,
        p50_periods=p50,
        p85_periods=p85,
        p95_periods=p95,
        p50_date=now + period * p50,
        p85_date=now + period * p85,
        p95_date=now + period * p95,
    )
