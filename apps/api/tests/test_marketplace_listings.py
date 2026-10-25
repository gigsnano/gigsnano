"""HTTP tests for marketplace listings and bids."""

from sqlalchemy import select

from gigsnano_api.models import Project, Story, Workspace


async def _setup_owner_workspace(client, db_session, slug="acme"):
    await client.post(
        "/api/auth/sign-up/",
        json={"display_name": "Owner", "email": "owner@test.com", "password": "s3cret!"},
    )
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": slug})
    ws = (await db_session.execute(select(Workspace).where(Workspace.slug == slug))).scalar_one()
    from gigsnano_api.billing.subscriptions import get_or_create_subscription
    from gigsnano_api.models.billing import EPlanTier
    (await get_or_create_subscription(db_session, ws.id)).tier = EPlanTier.BUSINESS  # marketplace needs Pro (GIN-234)
    await db_session.commit()
    return ws


async def _setup_freelancer(client):
    await client.post(
        "/api/auth/sign-up/",
        json={"display_name": "Freelancer", "email": "freelancer@test.com", "password": "s3cret!"},
    )


async def _seed_story(db_session, workspace_id: str) -> Story:
    project = Project(
        workspace_id=workspace_id,
        name="App",
        identifier="APP",
        cover_image_url="https://img.test/cover.jpg",
    )
    db_session.add(project)
    await db_session.flush()
    story = Story(project_id=project.id, title="Build feature", description="Do the thing")
    db_session.add(story)
    await db_session.commit()
    await db_session.refresh(story)
    return story


async def test_publish_listing_on_story(client, db_session):
    ws = await _setup_owner_workspace(client, db_session)
    story = await _seed_story(db_session, ws.id)

    r = await client.post(
        f"/api/workspaces/{ws.slug}/marketplace/listings/",
        json={"story_id": story.id, "title": "Need a dev", "description": "Build it"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["story_id"] == story.id
    assert body["status"] == "open"
    assert body["workspace_id"] == ws.id


async def test_publish_requires_exactly_one_target(client, db_session):
    ws = await _setup_owner_workspace(client, db_session)
    story = await _seed_story(db_session, ws.id)

    r = await client.post(
        f"/api/workspaces/{ws.slug}/marketplace/listings/",
        json={"story_id": story.id, "cycle_id": "x", "title": "Bad"},
    )
    assert r.status_code == 400


async def test_public_feed_lists_open_listings(client, db_session):
    ws = await _setup_owner_workspace(client, db_session)
    story = await _seed_story(db_session, ws.id)
    await client.post(
        f"/api/workspaces/{ws.slug}/marketplace/listings/",
        json={"story_id": story.id, "title": "Public job", "description": ""},
    )

    r = await client.get("/api/marketplace/listings/")
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["title"] == "Public job"


async def test_bid_and_self_deal_guard(client, db_session):
    ws = await _setup_owner_workspace(client, db_session)
    story = await _seed_story(db_session, ws.id)
    pub = await client.post(
        f"/api/workspaces/{ws.slug}/marketplace/listings/",
        json={"story_id": story.id, "title": "Job", "description": ""},
    )
    listing_id = pub.json()["id"]

    # Owner cannot bid on own listing
    r_owner = await client.post(
        f"/api/marketplace/listings/{listing_id}/bids/",
        json={"amount_cents": 1000, "message": "mine"},
    )
    assert r_owner.status_code == 403

    await _setup_freelancer(client)
    r_bid = await client.post(
        f"/api/marketplace/listings/{listing_id}/bids/",
        json={"amount_cents": 1500, "message": "I can help", "delivery_days": 7},
    )
    assert r_bid.status_code == 200
    assert r_bid.json()["amount_cents"] == 1500

    await client.post("/api/auth/sign-in/", json={"email": "owner@test.com", "password": "s3cret!"})
    r_bids = await client.get(f"/api/workspaces/{ws.slug}/marketplace/listings/{listing_id}/bids/")
    assert r_bids.status_code == 200
    assert len(r_bids.json()) == 1


async def test_duplicate_pending_bid_rejected(client, db_session):
    ws = await _setup_owner_workspace(client, db_session)
    story = await _seed_story(db_session, ws.id)
    pub = await client.post(
        f"/api/workspaces/{ws.slug}/marketplace/listings/",
        json={"story_id": story.id, "title": "Job", "description": ""},
    )
    listing_id = pub.json()["id"]

    await _setup_freelancer(client)
    payload = {"amount_cents": 1000, "message": "first"}
    assert (await client.post(f"/api/marketplace/listings/{listing_id}/bids/", json=payload)).status_code == 200
    r2 = await client.post(f"/api/marketplace/listings/{listing_id}/bids/", json=payload)
    assert r2.status_code == 409
