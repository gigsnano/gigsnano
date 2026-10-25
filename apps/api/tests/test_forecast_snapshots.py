"""GIN-335 s2: forecast-snapshot persistence + calibration.

Covers the pure outcome-pairing → calibration coverage, plus the HTTP recalc
idempotency (no duplicate history) and per-project isolation.
"""

from datetime import datetime, timedelta, timezone

from gigsnano_api.features.forecasting.snapshots import _pair_outcomes
from gigsnano_api.lib.calibration import calibration_report
from gigsnano_api.models import ForecastSnapshot
from tests.test_stories import setup_project

T0 = datetime(2026, 1, 1, tzinfo=timezone.utc)


def _snap(**kw) -> ForecastSnapshot:
    base = dict(
        project_id="p",
        calculated_at=T0,
        algorithm_version="montecarlo-count-v1",
        forecastable=True,
        remaining_units=1,
        confidence="medium",
        data_quality="ok",
        p50_date=T0 + timedelta(days=5),
        p85_date=T0 + timedelta(days=10),
        p95_date=T0 + timedelta(days=15),
    )
    base.update(kw)
    return ForecastSnapshot(**base)


def test_pair_outcomes_resolves_to_nth_completion():
    # remaining=1 → outcome is the first completion after calculated_at (day 8).
    snap = _snap(remaining_units=1)
    completions = [T0 - timedelta(days=1), T0 + timedelta(days=8)]  # one before, one after
    [outcome] = _pair_outcomes([snap], sorted(completions))
    assert outcome.actual_completion == T0 + timedelta(days=8)


def test_pair_outcomes_open_when_short_of_remaining():
    # remaining=3 but only 2 completions after → still open (None), excluded from coverage.
    snap = _snap(remaining_units=3)
    completions = [T0 + timedelta(days=8), T0 + timedelta(days=9)]
    [outcome] = _pair_outcomes([snap], completions)
    assert outcome.actual_completion is None


def test_pair_outcomes_skips_non_forecastable():
    assert _pair_outcomes([_snap(forecastable=False)], []) == []
    assert _pair_outcomes([_snap(remaining_units=0)], []) == []


def test_calibration_coverage_over_paired_outcomes():
    # Actual completion (day 8) misses p50 (day 5) but is within p85 (day 10)/p95 (day 15).
    snap = _snap(remaining_units=1)
    outcomes = _pair_outcomes([snap], [T0 + timedelta(days=8)])
    rep = calibration_report(outcomes, algorithm_version="montecarlo-count-v1")
    by_band = {b.band: b for b in rep.bands}
    assert rep.resolved_samples == 1
    assert by_band["p50"].observed == 0.0  # missed
    assert by_band["p85"].observed == 1.0  # covered
    assert by_band["p95"].observed == 1.0


async def test_recalc_is_idempotent(client):
    project = await setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}/forecasting"

    first = (await client.post(f"{base}/recalc/")).json()
    assert first["created"] is True
    second = (await client.post(f"{base}/recalc/")).json()
    # Unchanged project state → no duplicate history row.
    assert second["created"] is False

    cal = (await client.get(f"{base}/calibration/")).json()
    assert cal["snapshot_count"] == 1
    assert cal["last_calculated_at"] is not None


async def test_calibration_is_project_scoped(client):
    a = await setup_project(client)
    # A second project in the same workspace needs a distinct identifier.
    b = (
        await client.post(
            "/api/workspaces/acme/projects/",
            json={"name": "Other", "identifier": "OTH", "flow": "fresh", "cover_image_url": "https://img.test/o.jpg"},
        )
    ).json()
    await client.post(f"/api/workspaces/acme/projects/{a['id']}/forecasting/recalc/")

    cal_a = (await client.get(f"/api/workspaces/acme/projects/{a['id']}/forecasting/calibration/")).json()
    cal_b = (await client.get(f"/api/workspaces/acme/projects/{b['id']}/forecasting/calibration/")).json()
    assert cal_a["snapshot_count"] == 1
    assert cal_b["snapshot_count"] == 0  # b never recalculated — no leak from a
