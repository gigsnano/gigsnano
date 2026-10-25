"""Contract lifecycle tests — accept, deliver, approve, cancel."""

from sqlalchemy import select

from gigsnano_api.models import EStoryStatus, Story, Workspace


async def _setup_owner(client, db_session, slug="acme"):
    await client.post(
        "/api/auth/sign-up/",
        json={"display_name": "Owner", "email": "owner@test.com", "password": "s3cret!"},
    )
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": slug})
    ws = (await db_session.execute(select(Workspace).where(Workspace.slug == slug))).scalar_one()
    from gigsnano_api.billing.subscriptions import get_or_create_subscription
    from gigsnano_api.models.billing import EPlanTier
    (await get_or_create_subscription(db_session, ws.id)).tier = EPlanTier.BUSINESS  # marketplace needs Pro
    await db_session.commit()
    return ws


async def _fund_wallet(client, slug):
    await client.post(f"/api/workspaces/{slug}/billing/topup/", json={"amount_cents": 10000})


async def _seed_story(db_session, workspace_id):
    from gigsnano_api.models import Project

    project = Project(
        workspace_id=workspace_id,
        name="App",
        identifier="APP",
        cover_image_url="https://img.test/cover.jpg",
    )
    db_session.add(project)
    await db_session.flush()
    story = Story(project_id=project.id, title="Task", description="")
    db_session.add(story)
    await db_session.commit()
    await db_session.refresh(story)
    return story


async def _publish_and_bid(client, db_session, ws):
    story = await _seed_story(db_session, ws.id)
    pub = await client.post(
        f"/api/workspaces/{ws.slug}/marketplace/listings/",
        json={"story_id": story.id, "title": "Job", "description": ""},
    )
    listing_id = pub.json()["id"]

    await client.post(
        "/api/auth/sign-up/",
        json={"display_name": "Freelancer", "email": "freelancer@test.com", "password": "s3cret!"},
    )
    bid = await client.post(
        f"/api/marketplace/listings/{listing_id}/bids/",
        json={"amount_cents": 1000, "message": "I'll do it"},
    )
    return story, listing_id, bid.json()["id"]


async def test_accept_holds_wallet(client, db_session):
    ws = await _setup_owner(client, db_session)
    await _fund_wallet(client, ws.slug)
    story, listing_id, bid_id = await _publish_and_bid(client, db_session, ws)

    await client.post("/api/auth/sign-in/", json={"email": "owner@test.com", "password": "s3cret!"})
    r = await client.post(
        f"/api/workspaces/{ws.slug}/marketplace/listings/{listing_id}/bids/{bid_id}/accept/"
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "in_progress"
    assert body["bid_cents"] == 1000

    wallet = await client.get(f"/api/workspaces/{ws.slug}/billing/wallet/")
    # $100 topup - $10 bid - $2 fee (20%) = $88 available, $12 held
    assert wallet.json()["available_cents"] == 8800
    assert wallet.json()["held_cents"] == 1200


async def test_accept_insufficient_balance_402(client, db_session):
    ws = await _setup_owner(client, db_session)
    _story, listing_id, bid_id = await _publish_and_bid(client, db_session, ws)

    await client.post("/api/auth/sign-in/", json={"email": "owner@test.com", "password": "s3cret!"})
    r = await client.post(
        f"/api/workspaces/{ws.slug}/marketplace/listings/{listing_id}/bids/{bid_id}/accept/"
    )
    assert r.status_code == 402


async def test_deliver_approve_completes_story(client, db_session):
    ws = await _setup_owner(client, db_session)
    await _fund_wallet(client, ws.slug)
    story, listing_id, bid_id = await _publish_and_bid(client, db_session, ws)
    story_id = story.id

    await client.post("/api/auth/sign-in/", json={"email": "owner@test.com", "password": "s3cret!"})
    accept = await client.post(
        f"/api/workspaces/{ws.slug}/marketplace/listings/{listing_id}/bids/{bid_id}/accept/"
    )
    contract_id = accept.json()["id"]

    await client.post("/api/auth/sign-in/", json={"email": "freelancer@test.com", "password": "s3cret!"})
    deliver = await client.post(f"/api/marketplace/contracts/{contract_id}/deliver/")
    assert deliver.status_code == 200
    assert deliver.json()["status"] == "delivered"

    await client.post("/api/auth/sign-in/", json={"email": "owner@test.com", "password": "s3cret!"})
    approve = await client.post(
        f"/api/workspaces/{ws.slug}/marketplace/contracts/{contract_id}/approve/"
    )
    assert approve.status_code == 200
    assert approve.json()["status"] == "completed"

    updated = (
        await db_session.execute(
            select(Story).where(Story.id == story_id).execution_options(populate_existing=True)
        )
    ).scalar_one()
    assert updated.status == EStoryStatus.DONE


async def test_cancel_releases_escrow(client, db_session):
    ws = await _setup_owner(client, db_session)
    await _fund_wallet(client, ws.slug)
    _story, listing_id, bid_id = await _publish_and_bid(client, db_session, ws)

    await client.post("/api/auth/sign-in/", json={"email": "owner@test.com", "password": "s3cret!"})
    accept = await client.post(
        f"/api/workspaces/{ws.slug}/marketplace/listings/{listing_id}/bids/{bid_id}/accept/"
    )
    contract_id = accept.json()["id"]

    cancel = await client.post(
        f"/api/workspaces/{ws.slug}/marketplace/contracts/{contract_id}/cancel/"
    )
    assert cancel.status_code == 200
    assert cancel.json()["status"] == "cancelled"

    wallet = await client.get(f"/api/workspaces/{ws.slug}/billing/wallet/")
    assert wallet.json()["available_cents"] == 10000
    assert wallet.json()["held_cents"] == 0
