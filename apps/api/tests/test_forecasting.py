"""GIN-334: Monte Carlo completion forecasts are reproducible, monotonic, honest
about empty history, and estimate-free (unit counts only)."""

from datetime import datetime, timedelta, timezone

from gigsnano_api.lib.forecasting import (
    DEFAULT_SEED,
    FORECAST_ALGORITHM_VERSION,
    forecast_completion,
)

UTC = timezone.utc
NOW = datetime(2026, 7, 20, 12, 0, tzinfo=UTC)


def test_percentiles_are_monotonic():
    r = forecast_completion([3, 5, 4, 6, 2, 5], remaining_units=40, now=NOW, period_days=7)
    assert r.forecastable
    assert r.p50_periods <= r.p85_periods <= r.p95_periods
    assert r.p50_date <= r.p85_date <= r.p95_date


def test_reproducible_with_seed():
    a = forecast_completion([3, 5, 4, 6, 2], remaining_units=30, now=NOW, period_days=7, seed=42)
    b = forecast_completion([3, 5, 4, 6, 2], remaining_units=30, now=NOW, period_days=7, seed=42)
    assert (a.p50_periods, a.p85_periods, a.p95_periods) == (b.p50_periods, b.p85_periods, b.p95_periods)


def test_dates_are_now_plus_periods():
    r = forecast_completion([5, 5, 5, 5], remaining_units=20, now=NOW, period_days=7, seed=DEFAULT_SEED)
    assert r.p85_date == NOW + timedelta(days=7) * r.p85_periods
    assert r.algorithm_version == FORECAST_ALGORITHM_VERSION


def test_steady_throughput_lands_in_expected_range():
    # ~5 units/week, 20 remaining → ≈4 weeks at P50, and P95 not wildly larger.
    r = forecast_completion([5, 5, 5, 5, 5, 5], remaining_units=20, now=NOW, period_days=7)
    assert r.p50_periods == 4
    assert 4 <= r.p85_periods <= 5
    assert r.p95_periods <= 6


def test_more_remaining_pushes_the_date_out():
    small = forecast_completion([4, 5, 3, 6], remaining_units=10, now=NOW, period_days=7)
    big = forecast_completion([4, 5, 3, 6], remaining_units=100, now=NOW, period_days=7)
    assert big.p50_periods > small.p50_periods


def test_no_history_is_not_forecastable():
    r = forecast_completion([], remaining_units=10, now=NOW, period_days=7)
    assert not r.forecastable and r.reason == "no_history"
    assert r.p50_date is None  # never an invented date


def test_all_zero_throughput_is_not_forecastable():
    r = forecast_completion([0, 0, 0, 0], remaining_units=10, now=NOW, period_days=7)
    assert not r.forecastable and r.reason == "no_throughput"


def test_nothing_remaining_completes_now():
    r = forecast_completion([5, 5], remaining_units=0, now=NOW, period_days=7)
    assert r.forecastable
    assert r.p50_periods == r.p85_periods == r.p95_periods == 0
    assert r.p95_date == NOW


def test_slow_weeks_included_widen_the_distribution():
    # Zeros are real slow periods → P95 should be no earlier than P50.
    r = forecast_completion([0, 8, 0, 6, 0, 4], remaining_units=24, now=NOW, period_days=7)
    assert r.forecastable
    assert r.p95_periods >= r.p50_periods
