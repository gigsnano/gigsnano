from sqlalchemy import select

from gigsnano_api.billing.subscriptions import get_or_create_subscription
from gigsnano_api.features.task_router.classifier import classify, classify_domain
from gigsnano_api.features.task_router.selector import route_task
from gigsnano_api.models.billing import EPlanTier
from gigsnano_api.models.workspace import Workspace


async def _grant_business(db, slug="acme"):
    ws = (await db.execute(select(Workspace).where(Workspace.slug == slug))).scalar_one()
    (await get_or_create_subscription(db, ws.id)).tier = EPlanTier.BUSINESS
    await db.commit()


def test_classify_domain_and_type():
    assert classify("Add invoice payment processing")[0] == "finance"
    assert classify("Fix the checkout cart bug")[0] == "ecommerce"
    assert classify("write E2E tests for login")[1] == "test"
    assert classify("Refactor the button component design")[1] == "design"
    assert classify("Build a new landing page") == ("general", "feature")


# GIN-283 was misrouted to ecommerce/high because substring matching fired on
# "catalog"⊂"catalogue" and the generic word "order". Permanent regression fixture.
_GIN_283 = (
    "Agent Skill Control Plane & Runtime — resolve, pin and deliver skills to "
    "Claude Code, Codex and Cursor. Every executable work item has a reproducible "
    "Execution Profile: which skills run, in what order, with which gates. Initial "
    "routing catalogue and cross-agent adapters. Starter routing tests pass for "
    "design, backend, database, bug, security and documentation work."
)


def test_classify_does_not_misfire_on_prose_substrings():
    # "catalogue" must not count as ecommerce "catalog"; lone "order" is too weak.
    # With the platform taxonomy (GIN-287) the epic resolves as platform, not ecommerce.
    domain, signals = classify_domain(_GIN_283)
    assert domain == "platform"
    assert "catalog" not in signals


async def test_route_agent_platform_epic_to_platform_expert(db_session, make_project):
    # GIN-283 must route to the platform expert on cited signals — never
    # ecommerce, and high confidence is only earned by those signals (GIN-292/287).
    project = await make_project()
    r = await route_task(db_session, project.workspace_id, _GIN_283)
    assert r["domain"] == "platform"
    assert r["persona_id"] == "persona:gigs-platform-expert"
    assert r["persona_id"] != "persona:gigs-ecommerce-expert"
    assert r["confidence"] == "high"
    assert any(c["type"] == "signal" for c in r["citations"])


async def test_route_finance_task_to_domain_expert(db_session, make_project):
    project = await make_project()
    r = await route_task(
        db_session, project.workspace_id, "Implement invoice billing with PCI compliance"
    )
    assert r["domain"] == "finance"
    assert r["persona_id"] == "persona:gigs-finance-expert"
    assert r["confidence"] == "high"
    assert {"type": "artifact", "ref": "persona:gigs-finance-expert"} in r["citations"]


async def test_route_test_task_to_qa_with_skill(db_session, make_project):
    project = await make_project()
    r = await route_task(db_session, project.workspace_id, "Add E2E test coverage for auth")
    assert r["task_type"] == "test"
    assert r["persona_id"] == "agent_qa"
    assert "skill:testing-tdd" in r["skills"]


async def test_route_ambiguous_falls_back(db_session, make_project):
    project = await make_project()
    r = await route_task(db_session, project.workspace_id, "Build a new landing page")
    assert r["domain"] == "general"
    assert r["persona_id"] == "agent_dev"
    assert r["confidence"] == "medium"


async def test_route_endpoint(app, client):
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
            json={"title": "Invoice payment ledger reconciliation"},
        )
    ).json()

    res = await client.get(
        f"/api/workspaces/acme/projects/{p['id']}/stories/{s['id']}/route/"
    )
    assert res.status_code == 200
    body = res.json()
    assert body["domain"] == "finance"
    assert body["persona_id"] == "persona:gigs-finance-expert"
    assert body["rationale"]


async def test_coordinate_creates_routed_run(app, client, db_session):
    await client.post(
        "/api/auth/sign-up/",
        json={"display_name": "Ada", "email": "ada@example.test", "password": "s3cret!"},
    )
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    await _grant_business(db_session)  # auto-route (coordinate) is Business-gated (GIN-234)
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
            json={"title": "Add PCI-compliant invoice payment"},
        )
    ).json()

    res = await client.post(
        f"/api/workspaces/acme/projects/{p['id']}/stories/{s['id']}/coordinate/",
        json={"autonomy": "draft"},
    )
    assert res.status_code == 201
    run = res.json()
    assert run["persona_id"] == "persona:gigs-finance-expert"
    assert run["state"] == "queued"
    # the routing decision is the run's opening step
    assert any("Routed" in step["summary"] for step in run["steps"])
    assert run["steps"][0]["payload"]["domain"] == "finance"
