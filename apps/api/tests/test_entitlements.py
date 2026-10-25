"""GIN-234/235/237 — Feature entitlements: the min-plan gate blocks a capability
until the workspace upgrades; metering enforces per-plan monthly quota with wallet
overage; the summary endpoint reports available/quota/used.
"""

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from gigsnano_api.billing import wallet as W
from gigsnano_api.billing.entitlements import check_entitlement
from gigsnano_api.billing.metering import meter, usage_this_month
from gigsnano_api.billing.subscriptions import get_or_create_subscription
from gigsnano_api.bmad.provider import FakeProvider
from gigsnano_api.models.billing import EPlanTier
from gigsnano_api.models.workspace import Workspace

_AST = {"trigger": "story.created", "conditions": [], "actions": [], "unsupported": []}


def test_check_entitlement():
    assert check_entitlement(EPlanTier.FREE, "agent_runs") is True   # Free-tier capability
    assert check_entitlement(EPlanTier.FREE, "automations") is False  # needs Pro
    assert check_entitlement(EPlanTier.PRO, "automations") is True
    assert check_entitlement(EPlanTier.PRO, "task_router") is False   # auto-route is Business
    assert check_entitlement(EPlanTier.BUSINESS, "task_router") is True
    assert check_entitlement(EPlanTier.FREE, "unknown_key") is True   # uncatalogued = allowed


async def _acme(client):
    await client.post("/api/auth/sign-up/",
                      json={"display_name": "Ada", "email": "a@t.test", "password": "s3cret!"})
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})


async def _ws_id(db, slug="acme") -> str:
    return (await db.execute(select(Workspace).where(Workspace.slug == slug))).scalar_one().id


async def test_automations_gated_until_upgrade(app, client, db_session):
    await _acme(client)
    pid = (await client.post("/api/workspaces/acme/projects/",
                             json={"name": "Web", "identifier": "WEB", "flow": "fresh",
                                   "cover_image_url": "https://img.test/c.jpg"})).json()["id"]
    app.state.llm_provider = FakeProvider(extractions=[_AST, _AST])

    # Free plan → automations (Pro) is 402, before the body ever compiles.
    blocked = await client.post(f"/api/workspaces/acme/projects/{pid}/automation-rules/",
                                json={"name": "r", "text": "..."})
    assert blocked.status_code == 402

    # Upgrade to Pro → allowed.
    sub = await get_or_create_subscription(db_session, await _ws_id(db_session))
    sub.tier = EPlanTier.PRO
    await db_session.commit()
    ok = await client.post(f"/api/workspaces/acme/projects/{pid}/automation-rules/",
                           json={"name": "r", "text": "..."})
    assert ok.status_code == 201


async def test_entitlements_summary(app, client, db_session):
    await _acme(client)
    summary = {e["key"]: e for e in (await client.get("/api/workspaces/acme/entitlements/")).json()}
    assert summary["automations"]["available"] is False           # Free
    assert summary["agent_runs"]["available"] is True
    assert summary["agent_runs"]["metered"] is True
    assert summary["agent_runs"]["quota"] == 20                    # Free quota


async def test_metering_quota_then_overage(db_session, make_project):
    project = await make_project()
    ws_id = project.workspace_id  # defaults to Free → agent_runs quota 20

    for _ in range(20):  # within quota — no charge
        await meter(db_session, ws_id, "agent_runs")
    assert await usage_this_month(db_session, ws_id, "agent_runs") == 20

    # 21st exceeds quota; wallet is empty → blocked with 402.
    with pytest.raises(HTTPException) as exc:
        await meter(db_session, ws_id, "agent_runs")
    assert exc.value.status_code == 402

    # Top up → the overage debits the wallet instead of blocking.
    await W.credit(db_session, ws_id, 100, ref_type="test_topup")
    await meter(db_session, ws_id, "agent_runs")
    wallet = await W.get_or_create_wallet(db_session, ws_id)
    assert wallet.available_cents == 90  # 100 - 10 overage
