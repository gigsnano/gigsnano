import json

from sqlalchemy import select

from gigsnano_api.models import Workspace


async def _setup_billing_workspace(client, db_session, slug="acme", email="ada@example.test"):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": email, "password": "s3cret!"})
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": slug})
    ws = (await db_session.execute(
        select(Workspace).where(Workspace.slug == slug)
    )).scalar_one()
    return ws


async def test_fake_topup_credits_immediately(client, db_session):
    ws = await _setup_billing_workspace(client, db_session)
    r = await client.post(
        f"/api/workspaces/{ws.slug}/billing/topup/",
        json={"amount_cents": 5000},
    )
    assert r.status_code == 200
    body = r.json()
    assert "checkout_url" in body
    r2 = await client.get(f"/api/workspaces/{ws.slug}/billing/wallet/")
    assert r2.json()["available_cents"] == 5000


async def test_topup_returns_checkout_url(client, db_session):
    ws = await _setup_billing_workspace(client, db_session, slug="beta", email="beta@example.test")
    r = await client.post(
        f"/api/workspaces/{ws.slug}/billing/topup/",
        json={"amount_cents": 5000},
    )
    assert r.status_code == 200
    body = r.json()
    assert "checkout_url" in body
    assert body["checkout_url"]
    r2 = await client.get(f"/api/workspaces/{ws.slug}/billing/wallet/")
    assert r2.json()["available_cents"] == 5000


async def test_checkout_completed_webhook_credits_once(client, db_session):
    ws = await _setup_billing_workspace(
        client, db_session, slug="gamma", email="gamma@example.test",
    )
    event = {"type": "checkout.session.completed",
             "data": {"object": {"id": "cs_1", "amount_total": 3000,
                                  "metadata": {"workspace_id": ws.id, "kind": "wallet_topup"}}}}
    body = json.dumps(event)
    for _ in range(2):
        await client.post("/api/billing/webhook/", content=body,
                          headers={"stripe-signature": "x"})
    r = await client.get(f"/api/workspaces/{ws.slug}/billing/wallet/")
    assert r.json()["available_cents"] == 3000


async def test_duplicate_webhook_credits_once(client, db_session):
    ws = await _setup_billing_workspace(
        client, db_session, slug="delta", email="delta@example.test",
    )
    event = {"type": "checkout.session.completed",
             "data": {"object": {"id": "cs_dupe", "amount_total": 1000,
                                 "metadata": {"workspace_id": ws.id,
                                              "kind": "wallet_topup"}}}}
    body = json.dumps(event)
    for _ in range(2):
        await client.post("/api/billing/webhook/", content=body,
                          headers={"stripe-signature": "x"})
    r = await client.get(f"/api/workspaces/{ws.slug}/billing/wallet/")
    assert r.json()["available_cents"] == 1000  # not 2000
