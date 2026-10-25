"""GIN-232 — E2E: a finance task auto-routes to gigs-finance-expert, coordinates
to a run, drives to review→done, and an override picks a different persona. The
MCP route/coordinate tools call these same endpoints (covered by the MCP suite)."""

from gigsnano_api.agent.runner import AgentText
from gigsnano_api.features.agent_runs.orchestrator import orchestrate
from gigsnano_api.models.agent_runs import AgentRun


async def _project_finance_story(client):
    await client.post(
        "/api/auth/sign-up/",
        json={"display_name": "Ada", "email": "ada@example.test", "password": "s3cret!"},
    )
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    p = (
        await client.post(
            "/api/workspaces/acme/projects/",
            json={"name": "Web", "identifier": "WEB", "flow": "fresh",
                  "cover_image_url": "https://img.test/c.jpg"},
        )
    ).json()
    s = (
        await client.post(
            f"/api/workspaces/acme/projects/{p['id']}/stories/",
            json={"title": "Reconcile invoice payments and ledger entries"},
        )
    ).json()
    return p["id"], s["id"]


async def _events(*evs):
    for e in evs:
        yield e


async def test_finance_task_routes_coordinates_completes_and_overrides(app, client, db_session):
    pid, sid = await _project_finance_story(client)
    # Auto-route (coordinate) is Business-gated (GIN-234).
    from sqlalchemy import select

    from gigsnano_api.billing.subscriptions import get_or_create_subscription
    from gigsnano_api.models.billing import EPlanTier
    from gigsnano_api.models.workspace import Workspace
    ws = (await db_session.execute(select(Workspace).where(Workspace.slug == "acme"))).scalar_one()
    (await get_or_create_subscription(db_session, ws.id)).tier = EPlanTier.BUSINESS
    await db_session.commit()
    base = f"/api/workspaces/acme/projects/{pid}/stories/{sid}"
    runs = f"{base}/runs"

    # 1. The router classifies finance and recommends the domain expert.
    routing = (await client.get(f"{base}/route/")).json()
    assert routing["domain"] == "finance"
    assert routing["persona_id"] == "persona:gigs-finance-expert"

    # 2. Coordinate: auto-route + start a run for that persona, routing step recorded.
    created = await client.post(f"{base}/coordinate/", json={"autonomy": "draft"})
    assert created.status_code == 201
    run_id = created.json()["id"]
    assert created.json()["persona_id"] == "persona:gigs-finance-expert"

    # 3. Drive to done: a clean (read-only) Draft turn lands in review, then approve.
    run = await db_session.get(AgentRun, run_id)
    await orchestrate(db_session, run, _events(AgentText("Reconciliation summary")))
    await db_session.commit()
    assert (await client.get(f"{runs}/{run_id}/")).json()["state"] == "awaiting_review"
    assert (await client.post(f"{runs}/{run_id}/approve/")).json()["state"] == "done"

    # 4. Override: a lead can pick a different persona instead of the recommendation.
    override = await client.post(runs + "/", json={"persona_id": "agent_dev", "autonomy": "draft"})
    assert override.status_code == 201
    assert override.json()["persona_id"] == "agent_dev"
