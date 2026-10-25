"""GIN-339: material-change health alerts on recalc.

Pure change detection (only degradations alert), plus the HTTP path — a recalc
after health degrades notifies the project's members, and the first recalc (no
prior snapshot) does not.
"""

from gigsnano_api.features.forecasting.alerts import detect_material_change
from gigsnano_api.models import ForecastSnapshot
from tests.test_stories import setup_project


def _snap(**kw) -> ForecastSnapshot:
    base = dict(health_status="on_track", confidence="high", forecast_vs_target="on")
    base.update(kw)
    return ForecastSnapshot(**base)


def test_detects_health_degradation():
    assert detect_material_change(_snap(health_status="on_track"), _snap(health_status="at_risk")) == [
        "health_degraded"
    ]


def test_detects_forecast_slip_and_confidence_collapse():
    prev = _snap(forecast_vs_target="on", confidence="high")
    curr = _snap(forecast_vs_target="off", confidence="low")
    reasons = detect_material_change(prev, curr)
    assert "forecast_slipped" in reasons
    assert "confidence_collapsed" in reasons


def test_improvement_and_steady_state_do_not_alert():
    assert detect_material_change(_snap(health_status="off_track"), _snap(health_status="on_track")) == []
    assert detect_material_change(_snap(), _snap()) == []


def _health_alerts(page: dict) -> list[dict]:
    results = page.get("results") or page.get("items") or []
    return [n for n in results if str(n.get("title", "")).startswith("Health alert")]


async def test_recalc_alerts_only_on_material_change(client):
    project = await setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}"

    # First recalc — no prior snapshot to compare, so no alert.
    await client.post(f"{base}/forecasting/recalc/")
    assert not _health_alerts((await client.get("/api/workspaces/acme/notifications/")).json())

    # An overdue work item degrades system health (no_data → off_track).
    await client.post(f"{base}/stories/", json={"title": "Late", "target_date": "2020-01-01"})
    r = await client.post(f"{base}/forecasting/recalc/")
    assert r.json()["created"] is True  # health changed → new snapshot

    alerts = _health_alerts((await client.get("/api/workspaces/acme/notifications/")).json())
    assert alerts, "expected a health-change alert for the project member"
    assert alerts[0]["kind"] == "system"
