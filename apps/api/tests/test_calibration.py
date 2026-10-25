"""GIN-335: calibration reports measure whether forecast bands hold over time."""

from datetime import datetime, timedelta, timezone

from gigsnano_api.lib.calibration import ForecastOutcome, calibration_report

UTC = timezone.utc
BASE = datetime(2026, 6, 1, tzinfo=UTC)


def _outcome(algo: str, p50: int, p85: int, p95: int, actual: int | None) -> ForecastOutcome:
    day = lambda n: BASE + timedelta(days=n) if n is not None else None  # noqa: E731
    return ForecastOutcome(algo, day(p50), day(p85), day(p95), day(actual))


def test_well_calibrated_p85_is_not_flagged():
    # 10 outcomes, actual on/before p85 in 9 → observed 0.9 vs expected 0.85.
    outcomes = [_outcome("v1", 10, 20, 30, actual=15) for _ in range(9)]
    outcomes.append(_outcome("v1", 10, 20, 30, actual=25))  # misses p85
    rep = calibration_report(outcomes, algorithm_version="v1")
    p85 = next(b for b in rep.bands if b.band == "p85")
    assert rep.resolved_samples == 10
    assert p85.observed == 0.9
    assert not p85.miscalibrated  # within default tolerance


def test_optimistic_forecast_is_flagged():
    # Every actual lands AFTER p85 → coverage 0, far below 0.85.
    outcomes = [_outcome("v1", 10, 20, 30, actual=40) for _ in range(8)]
    rep = calibration_report(outcomes, algorithm_version="v1")
    p85 = next(b for b in rep.bands if b.band == "p85")
    assert p85.observed == 0.0
    assert p85.gap < 0  # optimistic (dates too early)
    assert p85.miscalibrated


def test_only_resolved_outcomes_count():
    outcomes = [
        _outcome("v1", 10, 20, 30, actual=15),
        _outcome("v1", 10, 20, 30, actual=None),  # still open — excluded
    ]
    rep = calibration_report(outcomes, algorithm_version="v1")
    assert rep.resolved_samples == 1


def test_report_filters_by_algorithm_version():
    outcomes = [
        _outcome("v1", 10, 20, 30, actual=15),
        _outcome("v2", 10, 20, 30, actual=40),
    ]
    rep = calibration_report(outcomes, algorithm_version="v1")
    assert rep.resolved_samples == 1
    assert rep.algorithm_version == "v1"


def test_coverage_is_monotonic_across_bands():
    outcomes = [_outcome("v1", 10, 20, 30, actual=a) for a in (5, 15, 25, 35)]
    rep = calibration_report(outcomes, algorithm_version="v1")
    cov = {b.band: b.observed for b in rep.bands}
    assert cov["p50"] <= cov["p85"] <= cov["p95"]


def test_no_resolved_outcomes_reports_zero_without_error():
    rep = calibration_report([], algorithm_version="v1")
    assert rep.resolved_samples == 0
    assert all(b.observed == 0.0 for b in rep.bands)
