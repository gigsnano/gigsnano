"""Forecast calibration analytics (GIN-335).

Given past forecast snapshots and the actual completion outcomes, measure whether
the probability bands held: a well-calibrated P85 forecast should see actual
completion on-or-before its date ~85% of the time. Reported per algorithm version
so versions can be compared and a regression caught before it ships.

Pure — records in, report out. The *persistence* of snapshots (a `forecast_snapshots`
table + scheduled recalculation + observability) is the deferred stateful half of
GIN-335; this module is the analysis that runs over whatever store provides them,
and is fully testable on plain fixtures today.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

# Expected coverage for each band — a P85 forecast should cover ~85% of outcomes.
EXPECTED_COVERAGE = {"p50": 0.50, "p85": 0.85, "p95": 0.95}


@dataclass(frozen=True)
class ForecastOutcome:
    """A past forecast paired with what actually happened. `actual_completion` is
    None while the project/cycle is still open (excluded from coverage)."""

    algorithm_version: str
    p50_date: datetime
    p85_date: datetime
    p95_date: datetime
    actual_completion: datetime | None


@dataclass(frozen=True)
class BandCoverage:
    band: str  # "p50" | "p85" | "p95"
    expected: float
    observed: float  # fraction of resolved outcomes completed on/before the band date
    resolved_samples: int
    # observed - expected. Negative = optimistic (dates too early); positive =
    # conservative. |gap| beyond `tolerance` in report() flags a miscalibration.
    gap: float
    miscalibrated: bool


@dataclass(frozen=True)
class CalibrationReport:
    algorithm_version: str
    resolved_samples: int
    bands: tuple[BandCoverage, ...]


def _band_date(o: ForecastOutcome, band: str) -> datetime:
    return {"p50": o.p50_date, "p85": o.p85_date, "p95": o.p95_date}[band]


def calibration_report(
    outcomes: list[ForecastOutcome],
    *,
    algorithm_version: str,
    tolerance: float = 0.15,
) -> CalibrationReport:
    """Coverage per band for one algorithm version. Only resolved outcomes (known
    actual completion) count; a band is `miscalibrated` when observed coverage
    deviates from expected by more than `tolerance`."""
    resolved = [
        o for o in outcomes if o.algorithm_version == algorithm_version and o.actual_completion is not None
    ]
    n = len(resolved)
    bands: list[BandCoverage] = []
    for band, expected in EXPECTED_COVERAGE.items():
        if n == 0:
            bands.append(BandCoverage(band, expected, 0.0, 0, -expected, False))
            continue
        covered = sum(1 for o in resolved if o.actual_completion <= _band_date(o, band))
        observed = covered / n
        gap = round(observed - expected, 4)
        bands.append(BandCoverage(band, expected, round(observed, 4), n, gap, abs(gap) > tolerance))
    return CalibrationReport(algorithm_version, n, tuple(bands))
