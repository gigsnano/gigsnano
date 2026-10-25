"""GIN-190 — E2E: the full marketplace bridge round-trip with money.

publish gig → matched candidates (agent + human) → hire (escrow HELD) → gig
state held → deliver → gig state in_review → approve → escrow CAPTURED + story
DONE + gig state released. No state drift between the gig and the work item.
"""

from sqlalchemy import select

from gigsnano_api.models import EStoryStatus, Project, Story, Workspace
from gigsnano_api.models.talent import Freelancer


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


async def test_full_marketplace_bridge_round_trip(app, client, db_session):
    ws = await _owner_ws(client, db_session)
    project = Project(
        workspace_id=ws.id, name="App", identifier="APP",
        cover_image_url="https://img.test/cover.jpg",
    )
    db_session.add(project)
    await db_session.flush()
    story = Story(project_id=project.id, title="Reconcile invoice payment ledger", description="")
    db_session.add(story)
    db_session.add(Freelancer(
        name="Fin Pro", title="Dev", country="US", city="NYC", hourly_rate=80,
        job_success_pct=95, total_earned_label="$50k", jobs_count=9, hours_worked=500,
        available_now=True, skills=["Finance", "Payments"], hours_per_week_label="40",
        member_since="2019",
    ))
    await db_session.commit()

    base = f"/api/workspaces/acme/projects/{project.id}/stories/{story.id}"

    # 1. Matched candidates for the item (AI agent + human).
    cands = (await client.get(f"{base}/match/")).json()
    assert any(c["type"] == "agent" for c in cands)
    assert any(c["type"] == "human" for c in cands)

    # 2. Publish as a gig + a freelancer bids.
    listing_id = (
        await client.post(
            "/api/workspaces/acme/marketplace/listings/",
            json={"story_id": story.id, "title": "Job", "description": ""},
        )
    ).json()["id"]
    await client.post(
        "/api/auth/sign-up/",
        json={"display_name": "Free", "email": "free@test.com", "password": "s3cret!"},
    )
    bid_id = (
        await client.post(
            f"/api/marketplace/listings/{listing_id}/bids/",
            json={"amount_cents": 1000, "message": "on it"},
        )
    ).json()["id"]

    # 3. Owner hires → escrow HELD; gig state on the work item = held.
    await client.post("/api/auth/sign-in/", json={"email": "owner@test.com", "password": "s3cret!"})
    contract_id = (
        await client.post(
            f"/api/workspaces/acme/marketplace/listings/{listing_id}/bids/{bid_id}/accept/"
        )
    ).json()["id"]
    assert (await client.get(f"{base}/gig/")).json()["escrow_state"] == "held"
    assert (await client.get("/api/workspaces/acme/billing/wallet/")).json()["held_cents"] == 1200

    # 4. Freelancer delivers.
    await client.post("/api/auth/sign-in/", json={"email": "free@test.com", "password": "s3cret!"})
    assert (await client.post(f"/api/marketplace/contracts/{contract_id}/deliver/")).status_code == 200

    # 5. Back as owner: gig state = in_review, then approve → CAPTURED + DONE + released.
    await client.post("/api/auth/sign-in/", json={"email": "owner@test.com", "password": "s3cret!"})
    assert (await client.get(f"{base}/gig/")).json()["escrow_state"] == "in_review"
    approve = await client.post(
        f"/api/workspaces/acme/marketplace/contracts/{contract_id}/approve/"
    )
    assert approve.status_code == 200
    assert approve.json()["status"] == "completed"

    assert (await client.get(f"{base}/gig/")).json()["escrow_state"] == "released"
    assert (await client.get("/api/workspaces/acme/billing/wallet/")).json()["held_cents"] == 0
    done = (await client.get(f"{base}/")).json()
    assert done["status"] == "done"  # no drift: work item completed
