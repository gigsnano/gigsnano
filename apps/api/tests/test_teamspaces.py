"""GIN-245/248 — Teamspaces E2E: entitlement-gated create, group members+projects,
cross-project rollup + hybrid (human+agent) workload overview, pin validation.
"""

from sqlalchemy import select

from gigsnano_api.billing.subscriptions import get_or_create_subscription
from gigsnano_api.models.billing import EPlanTier
from gigsnano_api.models.workspace import Workspace


async def _acme_pro(client, db_session):
    await client.post("/api/auth/sign-up/",
                      json={"display_name": "Ada", "email": "a@t.test", "password": "s3cret!"})
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    ws = (await db_session.execute(select(Workspace).where(Workspace.slug == "acme"))).scalar_one()
    return ws


async def _project(client, ident):
    return (await client.post("/api/workspaces/acme/projects/",
                              json={"name": ident, "identifier": ident, "flow": "fresh",
                                    "cover_image_url": "https://img.test/c.jpg"})).json()["id"]


async def _story(client, pid, title, done=False):
    sid = (await client.post(f"/api/workspaces/acme/projects/{pid}/stories/",
                             json={"title": title})).json()["id"]
    if done:
        await client.patch(f"/api/workspaces/acme/projects/{pid}/stories/{sid}/", json={"status": "done"})
    return sid


async def test_teamspace_gated_rollup_and_overview(app, client, db_session):
    ws = await _acme_pro(client, db_session)
    p1, p2 = await _project(client, "WEB"), await _project(client, "API")

    # Free plan → create is 402 (teamspaces is Pro).
    blocked = await client.post("/api/workspaces/acme/teamspaces/", json={"name": "Core"})
    assert blocked.status_code == 402

    (await get_or_create_subscription(db_session, ws.id)).tier = EPlanTier.PRO
    await db_session.commit()

    ts = (await client.post("/api/workspaces/acme/teamspaces/",
                            json={"name": "Core", "project_ids": [p1, p2]})).json()
    assert set(ts["project_ids"]) == {p1, p2}

    # Baseline includes each project's seeded Sprint-0 cards; assert our delta.
    rollup_url = f"/api/workspaces/acme/teamspaces/{ts['id']}/rollup/"
    base = (await client.get(rollup_url)).json()
    await _story(client, p1, "Checkout", done=True)
    await _story(client, p2, "Webhooks", done=False)

    roll = (await client.get(rollup_url)).json()
    assert roll["total"] == base["total"] + 2 and roll["done"] == base["done"] + 1

    overview = (await client.get(f"/api/workspaces/acme/teamspaces/{ts['id']}/overview/")).json()
    assert {p["id"] for p in overview["projects"]} == {p1, p2}
    assert overview["rollup"]["total"] == roll["total"]
    assert "unassigned" in overview["human_workload"]          # open items, unassigned
    assert any(a["id"] == "agent_dev" for a in overview["agent_workload"])  # the persona roster


async def test_set_projects_and_invalid_pin(app, client, db_session):
    ws = await _acme_pro(client, db_session)
    (await get_or_create_subscription(db_session, ws.id)).tier = EPlanTier.PRO
    await db_session.commit()
    p1 = await _project(client, "WEB")

    ts = (await client.post("/api/workspaces/acme/teamspaces/", json={"name": "T"})).json()
    updated = (await client.put(f"/api/workspaces/acme/teamspaces/{ts['id']}/projects/",
                                json={"ids": [p1]})).json()
    assert updated["project_ids"] == [p1]

    # An unknown pinned artifact id is rejected.
    bad = await client.post("/api/workspaces/acme/teamspaces/",
                            json={"name": "X", "pinned_artifacts": ["does-not-exist"]})
    assert bad.status_code == 400
