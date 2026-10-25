"""GIN-336: the health endpoint returns explainable, evidence-backed status."""

from tests.test_stories import setup_project


async def test_health_new_project_is_no_data(client):
    project = await setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}"
    body = (await client.get(f"{base}/forecasting/health/")).json()
    assert body["status"] == "no_data"
    assert body["reasons"]  # always has a reason
    assert body["rules_version"]


async def test_health_overdue_work_flags_risk_with_drilldown(client):
    project = await setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}"
    s = (await client.post(f"{base}/stories/", json={"title": "Late", "target_date": "2020-01-01"})).json()

    body = (await client.get(f"{base}/forecasting/health/")).json()
    assert body["status"] in {"at_risk", "off_track"}
    overdue = next(r for r in body["reasons"] if r["code"] == "overdue_work")
    assert s["id"] in overdue["contributing_ids"]  # drill-down id present
    assert overdue["metric"] >= 1


async def test_health_unknown_project_404(client):
    await setup_project(client)
    res = await client.get(
        "/api/workspaces/acme/projects/00000000-0000-0000-0000-000000000000/forecasting/health/"
    )
    assert res.status_code == 404


async def test_health_overdue_yields_recovery_recommendation(client):
    project = await setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}"
    await client.post(f"{base}/stories/", json={"title": "Late", "target_date": "2020-01-01"})

    body = (await client.get(f"{base}/forecasting/health/")).json()
    assert body["recovery_version"]
    rec = next(r for r in body["recommendations"] if r["action"] == "reassess_overdue")
    # Advisory + evidence-backed: cites impact, assumption, decision.
    assert rec["impact"] and rec["assumption"] and rec["decision_needed"]


async def test_health_no_data_has_no_recommendations(client):
    project = await setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}"
    body = (await client.get(f"{base}/forecasting/health/")).json()
    assert body["status"] == "no_data"
    assert body["recommendations"] == []
