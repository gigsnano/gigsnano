"""GIN-185 — work-item completion binds escrow: a story reaching DONE advances
its funded marketplace contract to DELIVERED (ready for owner release). Money
never moves on this hook — capture stays owner-gated (approve_contract)."""

from sqlalchemy import select

from gigsnano_api.models import Project, Story, Workspace


async def _owner_ws(client, db_session):
    await client.post(
        "/api/auth/sign-up/",
        json={"display_name": "Owner", "email": "owner@test.com", "password": "s3cret!"},
    )
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    await client.post("/api/workspaces/acme/billing/topup/", json={"amount_cents": 10000})
    ws = (await db_session.execute(select(Workspace).where(Workspace.slug == "acme"))).scalar_one()
    from gigsnano_api.billing.subscriptions import get_or_create_subscription
    from gigsnano_api.models.billing import EPlanTier
    (await get_or_create_subscription(db_session, ws.id)).tier = EPlanTier.BUSINESS  # marketplace needs Pro
    await db_session.commit()
    return ws


async def _story(db_session, workspace_id):
    project = Project(
        workspace_id=workspace_id, name="App", identifier="APP",
        cover_image_url="https://img.test/cover.jpg",
    )
    db_session.add(project)
    await db_session.flush()
    story = Story(project_id=project.id, title="Task", description="")
    db_session.add(story)
    await db_session.commit()
    await db_session.refresh(story)
    return story


async def _funded_contract(client, db_session, ws):
    story = await _story(db_session, ws.id)
    listing_id = (
        await client.post(
            f"/api/workspaces/{ws.slug}/marketplace/listings/",
            json={"story_id": story.id, "title": "Job", "description": ""},
        )
    ).json()["id"]
    await client.post(
        "/api/auth/sign-up/",
        json={"display_name": "Freelancer", "email": "free@test.com", "password": "s3cret!"},
    )
    bid_id = (
        await client.post(
            f"/api/marketplace/listings/{listing_id}/bids/",
            json={"amount_cents": 1000, "message": "on it"},
        )
    ).json()["id"]
    await client.post("/api/auth/sign-in/", json={"email": "owner@test.com", "password": "s3cret!"})
    contract = (
        await client.post(
            f"/api/workspaces/{ws.slug}/marketplace/listings/{listing_id}/bids/{bid_id}/accept/"
        )
    ).json()
    return story, contract["id"]


async def test_completion_advances_contract_to_delivered(app, client, db_session):
    ws = await _owner_ws(client, db_session)
    story, contract_id = await _funded_contract(client, db_session, ws)

    before = (await client.get(f"/api/workspaces/{ws.slug}/billing/wallet/")).json()

    patched = await client.patch(
        f"/api/workspaces/{ws.slug}/projects/{story.project_id}/stories/{story.id}/",
        json={"status": "done"},
    )
    assert patched.status_code == 200

    contract = await client.get(f"/api/marketplace/contracts/{contract_id}/")
    assert contract.json()["status"] == "delivered"  # bound to completion, ready for release

    after = (await client.get(f"/api/workspaces/{ws.slug}/billing/wallet/")).json()
    assert after["held_cents"] == before["held_cents"]  # money did NOT move


async def test_completion_without_gig_is_noop(app, client, db_session):
    ws = await _owner_ws(client, db_session)
    story = await _story(db_session, ws.id)
    res = await client.patch(
        f"/api/workspaces/{ws.slug}/projects/{story.project_id}/stories/{story.id}/",
        json={"status": "done"},
    )
    assert res.status_code == 200  # no gig -> hook is a clean no-op


async def test_gig_state_reflects_escrow(app, client, db_session):
    ws = await _owner_ws(client, db_session)
    story, _contract_id = await _funded_contract(client, db_session, ws)

    gig = await client.get(
        f"/api/workspaces/{ws.slug}/projects/{story.project_id}/stories/{story.id}/gig/"
    )
    assert gig.status_code == 200
    body = gig.json()
    assert body["published"] is True
    assert body["escrow_state"] == "held"  # contract in_progress -> escrow held
    assert body["amount_cents"] == 1200  # bid 1000 + 20% fee 200


async def test_gig_state_none_when_not_published(app, client, db_session):
    ws = await _owner_ws(client, db_session)
    story = await _story(db_session, ws.id)
    gig = await client.get(
        f"/api/workspaces/{ws.slug}/projects/{story.project_id}/stories/{story.id}/gig/"
    )
    assert gig.json()["published"] is False
