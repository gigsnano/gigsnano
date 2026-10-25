import json

from sqlalchemy import select

from gigsnano_api.models import Subscription, Workspace


async def _webhook(client, event: dict):
    return await client.post("/api/billing/webhook/", content=json.dumps(event))


def _checkout_event(ws_id, tier="pro", cust="cus_1", sub="sub_1", sid="cs_1"):
    return {
        "type": "checkout.session.completed",
        "data": {"object": {
            "id": sid, "customer": cust, "subscription": sub,
            "metadata": {"kind": "subscription", "workspace_id": ws_id, "tier": tier},
        }},
    }


async def _setup(client, db_session, slug="acme", email="ada@example.test"):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": email, "password": "s3cret!"})
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": slug})
    return (await db_session.execute(
        select(Workspace).where(Workspace.slug == slug)
    )).scalar_one()


async def test_subscription_defaults_to_free(client, db_session):
    ws = await _setup(client, db_session)
    r = await client.get(f"/api/workspaces/{ws.slug}/billing/subscription/")
    assert r.status_code == 200
    body = r.json()
    assert body["tier"] == "free"
    assert body["interval"] == "monthly"
    assert body["status"] == "active"
    assert body["current_period_end"] is None
    # the creator is an active owner → one seat used
    assert body["seats_used"] == 1


async def test_subscription_is_persisted_and_stable(client, db_session):
    ws = await _setup(client, db_session, slug="beta", email="beta@example.test")
    first = (await client.get(f"/api/workspaces/{ws.slug}/billing/subscription/")).json()
    second = (await client.get(f"/api/workspaces/{ws.slug}/billing/subscription/")).json()
    assert first == second  # no duplicate rows created on re-read


async def test_fake_checkout_returns_url(client, db_session):
    ws = await _setup(client, db_session, slug="gamma", email="gamma@example.test")
    r = await client.post(
        f"/api/workspaces/{ws.slug}/billing/checkout/",
        json={"tier": "pro", "interval": "monthly"},
    )
    assert r.status_code == 200
    assert r.json()["checkout_url"]


async def test_fake_checkout_upgrades_tier_immediately(client, db_session):
    # Keyless/fake mode has no Stripe webhook, so the checkout itself must apply
    # the upgrade — otherwise "View plans → Upgrade" redirects back but the plan
    # stays Free and the user can never upgrade (GIN-30 bug).
    ws = await _setup(client, db_session, slug="zeta", email="zeta@example.test")
    r = await client.post(
        f"/api/workspaces/{ws.slug}/billing/checkout/",
        json={"tier": "pro", "interval": "annual"},
    )
    assert r.status_code == 200
    sub = (await client.get(f"/api/workspaces/{ws.slug}/billing/subscription/")).json()
    assert sub["tier"] == "pro"
    assert sub["interval"] == "annual"
    assert sub["status"] == "active"


async def test_fake_portal_returns_url(client, db_session):
    ws = await _setup(client, db_session, slug="delta", email="delta@example.test")
    r = await client.post(f"/api/workspaces/{ws.slug}/billing/portal/")
    assert r.status_code == 200
    assert r.json()["checkout_url"]


async def test_checkout_rejects_bad_tier(client, db_session):
    ws = await _setup(client, db_session, slug="epsilon", email="eps@example.test")
    r = await client.post(
        f"/api/workspaces/{ws.slug}/billing/checkout/",
        json={"tier": "enterprise", "interval": "monthly"},
    )
    assert r.status_code == 422  # not a valid EPlanTier


async def test_checkout_completed_webhook_sets_tier_and_customer(client, db_session):
    ws = await _setup(client, db_session, slug="wh1", email="wh1@example.test")
    ws_id, ws_slug = ws.id, ws.slug
    r = await _webhook(client, _checkout_event(ws_id, tier="pro", cust="cus_wh1", sub="sub_wh1"))
    assert r.status_code == 200

    body = (await client.get(f"/api/workspaces/{ws_slug}/billing/subscription/")).json()
    assert body["tier"] == "pro"
    assert body["status"] == "active"

    db_session.expire_all()
    row = (await db_session.execute(
        select(Subscription).where(Subscription.workspace_id == ws_id)
    )).scalar_one()
    assert row.stripe_customer_id == "cus_wh1"
    assert row.stripe_subscription_id == "sub_wh1"


async def test_subscription_updated_webhook_syncs_from_price_metadata(client, db_session):
    ws = await _setup(client, db_session, slug="wh2", email="wh2@example.test")
    await _webhook(client, _checkout_event(ws.id, tier="pro", cust="cus_wh2", sub="sub_wh2"))
    await _webhook(client, {
        "type": "customer.subscription.updated",
        "data": {"object": {
            "id": "sub_wh2", "customer": "cus_wh2", "status": "active",
            "current_period_end": 1800000000,
            "items": {"data": [{"price": {"metadata": {
                "gigsnano_tier": "business", "gigsnano_interval": "annual"}}}]},
        }},
    })
    body = (await client.get(f"/api/workspaces/{ws.slug}/billing/subscription/")).json()
    assert body["tier"] == "business"
    assert body["interval"] == "annual"
    assert body["current_period_end"] is not None


async def test_subscription_deleted_webhook_downgrades_to_free(client, db_session):
    ws = await _setup(client, db_session, slug="wh3", email="wh3@example.test")
    await _webhook(client, _checkout_event(ws.id, tier="pro", cust="cus_wh3", sub="sub_wh3"))
    await _webhook(client, {
        "type": "customer.subscription.deleted",
        "data": {"object": {"id": "sub_wh3", "customer": "cus_wh3"}},
    })
    body = (await client.get(f"/api/workspaces/{ws.slug}/billing/subscription/")).json()
    assert body["tier"] == "free"
    assert body["status"] == "canceled"


async def test_webhook_ignores_unknown_subscription(client, db_session):
    # a subscription event for a sub we've never seen is a graceful no-op
    r = await _webhook(client, {
        "type": "customer.subscription.updated",
        "data": {"object": {"id": "sub_unknown", "customer": "cus_unknown", "status": "active",
                            "items": {"data": []}}},
    })
    assert r.status_code == 200
