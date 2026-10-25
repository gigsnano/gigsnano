"""Admin billing — manual plan override (Slice 1) + plan-price config (Slice 2) (GIN-30)."""

from tests.helpers import make_staff


async def test_admin_set_workspace_plan_upgrades_it(client, db_session):
    await make_staff(client, db_session)  # superadmin ⇒ has billing.manage
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})

    r = await client.post(
        "/api/admin/billing/workspaces/acme/plan/",
        json={"tier": "pro", "interval": "annual"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["tier"] == "pro"

    sub = (await client.get("/api/workspaces/acme/billing/subscription/")).json()
    assert sub["tier"] == "pro"
    assert sub["interval"] == "annual"
    assert sub["status"] == "active"


async def test_admin_set_workspace_plan_unknown_workspace_404(client, db_session):
    await make_staff(client, db_session)
    r = await client.post(
        "/api/admin/billing/workspaces/nope/plan/", json={"tier": "pro"}
    )
    assert r.status_code == 404


async def test_admin_set_workspace_plan_requires_privilege(client, db_session):
    # A plain (non-staff) user can't override anyone's plan.
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Bob", "email": "bob@example.test", "password": "s3cret!"})
    await client.post("/api/workspaces/", json={"name": "Beta", "slug": "beta"})
    r = await client.post(
        "/api/admin/billing/workspaces/beta/plan/", json={"tier": "pro"}
    )
    assert r.status_code == 403


# ── Slice 2: plan-price config ───────────────────────────────────────────────


async def test_plans_list_starts_unconfigured(client, db_session):
    await make_staff(client, db_session)
    rows = (await client.get("/api/admin/billing/plans/")).json()
    # Pro/Business × Monthly/Annual = 4 configurable combos, none configured yet.
    assert len(rows) == 4
    assert all(not r["configured"] for r in rows)


async def test_set_plan_price_creates_and_persists(client, db_session):
    await make_staff(client, db_session)
    r = await client.put(
        "/api/admin/billing/plans/pro/monthly/price/",
        json={"amount_cents": 800},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["configured"] is True
    assert body["unit_amount_cents"] == 800
    assert body["stripe_price_id"]  # fake price id in keyless tests

    rows = (await client.get("/api/admin/billing/plans/")).json()
    pro_monthly = next(x for x in rows if x["tier"] == "pro" and x["interval"] == "monthly")
    assert pro_monthly["configured"] is True
    assert pro_monthly["unit_amount_cents"] == 800


async def test_set_plan_price_rejects_free(client, db_session):
    await make_staff(client, db_session)
    r = await client.put(
        "/api/admin/billing/plans/free/monthly/price/", json={"amount_cents": 100}
    )
    assert r.status_code == 400


async def test_set_plan_price_requires_privilege(client, db_session):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Cid", "email": "cid@example.test", "password": "s3cret!"})
    r = await client.put(
        "/api/admin/billing/plans/pro/monthly/price/", json={"amount_cents": 800}
    )
    assert r.status_code == 403
