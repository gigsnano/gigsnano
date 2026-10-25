"""Self-hosted installs (BILLING_ENABLED=false) have no plans to buy, so nothing is
paywalled: every capability is available and metered quotas are unlimited."""
import pytest
from sqlalchemy import select

from gigsnano_api.billing import wallet as W
from gigsnano_api.billing.entitlements import effective_tier
from gigsnano_api.billing.metering import entitlement_summary, meter
from gigsnano_api.core.config import settings
from gigsnano_api.models.billing import EPlanTier
from gigsnano_api.models.workspace import Workspace


def test_effective_tier_is_plan_tier_when_billing_enabled(monkeypatch):
    monkeypatch.setattr(settings, "billing_enabled", True)
    assert effective_tier(EPlanTier.FREE) is EPlanTier.FREE


def test_effective_tier_unlocks_everything_when_billing_disabled(monkeypatch):
    monkeypatch.setattr(settings, "billing_enabled", False)
    assert effective_tier(EPlanTier.FREE) is EPlanTier.BUSINESS


async def _acme(client):
    await client.post("/api/auth/sign-up/",
                      json={"display_name": "Ada", "email": "a@t.test", "password": "s3cret!"})
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})


async def _ws_id(db) -> str:
    return (await db.execute(select(Workspace).where(Workspace.slug == "acme"))).scalar_one().id


async def test_pro_feature_open_on_free_plan_when_billing_disabled(client, monkeypatch):
    monkeypatch.setattr(settings, "billing_enabled", False)
    await _acme(client)
    res = await client.post("/api/workspaces/acme/teamspaces/", json={"name": "Core"})
    assert res.status_code != 402


async def test_metered_quota_never_blocks_when_billing_disabled(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "billing_enabled", False)
    await _acme(client)
    ws_id = await _ws_id(db_session)
    for _ in range(25):  # FREE quota for agent_runs is 20; empty wallet
        await meter(db_session, ws_id, "agent_runs")
    assert (await W.get_or_create_wallet(db_session, ws_id)).available_cents == 0


async def test_summary_reports_everything_available_when_billing_disabled(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "billing_enabled", False)
    await _acme(client)
    summary = await entitlement_summary(db_session, await _ws_id(db_session))
    assert all(row["available"] for row in summary)
    assert all(row["quota"] is None for row in summary)


async def test_quota_still_enforced_when_billing_enabled(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "billing_enabled", True)
    await _acme(client)
    ws_id = await _ws_id(db_session)
    for _ in range(20):
        await meter(db_session, ws_id, "agent_runs")
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        await meter(db_session, ws_id, "agent_runs")
    assert exc.value.status_code == 402
