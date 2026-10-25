"""GIN-333: the delivery-metrics endpoint reflects real recorded history and is
project-scoped."""

from tests.test_stories import setup_project


async def test_delivery_metrics_reflects_completed_work(client):
    project = await setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}"
    s = (await client.post(f"{base}/stories/", json={"title": "Ship it"})).json()
    # Real transitions → the PATCH route logs status activities the metrics read.
    await client.patch(f"{base}/stories/{s['id']}/", json={"status": "in_progress"})
    await client.patch(f"{base}/stories/{s['id']}/", json={"status": "done"})

    res = await client.get(f"{base}/forecasting/delivery-metrics/")
    assert res.status_code == 200, res.text
    body = res.json()

    assert body["scope"]["delivered"] >= 1
    assert sum(b["completed"] for b in body["throughput"]) >= 1
    assert body["cycle_time"]["samples"] >= 1
    assert body["data_quality"] in {"no_data", "low_data", "ok"}
    assert body["cycle_time"]["confidence"] in {"exact", "approximate", "none"}
    assert 0.0 <= body["approximate_share"] <= 1.0


async def test_delivery_metrics_new_project_reports_no_data(client):
    project = await setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}"
    body = (await client.get(f"{base}/forecasting/delivery-metrics/")).json()
    # Sprint-0 seed is all todo → nothing delivered yet.
    assert body["scope"]["delivered"] == 0
    assert body["data_quality"] == "no_data"
    assert body["cycle_time"]["confidence"] == "none"


async def test_delivery_metrics_unknown_project_404(client):
    await setup_project(client)
    res = await client.get(
        "/api/workspaces/acme/projects/00000000-0000-0000-0000-000000000000/forecasting/delivery-metrics/"
    )
    assert res.status_code == 404


async def test_forecast_new_project_not_forecastable(client):
    project = await setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}"
    body = (await client.get(f"{base}/forecasting/completion/")).json()
    # Sprint-0 seed is all todo → no throughput → honest No forecast, no date.
    assert body["forecastable"] is False
    assert body["reason"] in {"no_history", "no_throughput"}
    assert body["p50_date"] is None
    assert body["algorithm_version"]


async def test_forecast_with_delivered_work_returns_monotonic_dates(client):
    project = await setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}"
    for i in range(3):
        s = (await client.post(f"{base}/stories/", json={"title": f"Done {i}"})).json()
        await client.patch(f"{base}/stories/{s['id']}/", json={"status": "done"})

    body = (await client.get(f"{base}/forecasting/completion/")).json()
    assert body["forecastable"] is True
    assert body["p50_date"] <= body["p85_date"] <= body["p95_date"]
    assert body["p50_periods"] <= body["p85_periods"] <= body["p95_periods"]
    assert body["remaining_units"] >= 1  # sprint-0 todos still remain
    # Confidence (GIN-335): always present and inspectable; thin history → low.
    assert body["confidence"] in {"no_data", "low", "medium", "high"}
    assert body["confidence"] == "low"  # only a few completions
    assert "insufficient_completions" in body["confidence_reasons"]
