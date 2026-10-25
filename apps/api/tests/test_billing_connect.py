async def test_onboard_creates_active_account_in_fake(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": "ada@example.test", "password": "s3cret!"})
    r = await client.post("/api/billing/connect/onboard/")
    assert r.status_code == 200
    assert "url" in r.json()

    r2 = await client.get("/api/billing/connect/status/")
    assert r2.json()["status"] == "active"
    assert r2.json()["payouts_enabled"] is True


async def test_refresh_status_survives_provider_error(db_session):
    # A stale/fake or revoked stripe_account_id (e.g. `fake_acct_*` under a real
    # Stripe key) must not raise — keep the last-known status so the page renders.
    from gigsnano_api.billing.connect import refresh_status
    from gigsnano_api.models import ConnectAccount, EConnectStatus

    acct = ConnectAccount(
        user_id="u_stale", stripe_account_id="fake_acct_1",
        status=EConnectStatus.ACTIVE, payouts_enabled=True,
    )
    db_session.add(acct)
    await db_session.flush()

    class BoomProvider:
        async def account_status(self, account_id):
            raise RuntimeError("stripe: key has no access to account")

    result = await refresh_status(db_session, BoomProvider(), acct)
    assert result.status == EConnectStatus.ACTIVE  # unchanged, no exception
    assert result.payouts_enabled is True
