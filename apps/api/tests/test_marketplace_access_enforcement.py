"""Fail-closed access enforcement for marketplace contractors."""


from sqlalchemy import select

from gigsnano_api.billing import wallet as W
from gigsnano_api.models import (
    EStoryStatus,
    Project,
    Story,
    Workspace,
)


async def _setup(client, db_session):
    await client.post(
        "/api/auth/sign-up/",
        json={"display_name": "Owner", "email": "owner@test.com", "password": "s3cret!"},
    )
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    ws = (await db_session.execute(select(Workspace).where(Workspace.slug == "acme"))).scalar_one()
    await W.credit(db_session, ws.id, 10000, ref_type="topup")
    from gigsnano_api.billing.subscriptions import get_or_create_subscription
    from gigsnano_api.models.billing import EPlanTier
    (await get_or_create_subscription(db_session, ws.id)).tier = EPlanTier.BUSINESS  # marketplace needs Pro
    await db_session.commit()

    project = Project(
        workspace_id=ws.id,
        name="App",
        identifier="APP",
        cover_image_url="https://img.test/cover.jpg",
    )
    db_session.add(project)
    await db_session.flush()
    epic = Story(id="epic-a", project_id=project.id, title="Epic", status=EStoryStatus.TODO)
    child = Story(
        id="child-a",
        project_id=project.id,
        parent_id="epic-a",
        title="Child",
        status=EStoryStatus.TODO,
    )
    sibling = Story(id="sib-a", project_id=project.id, title="Sibling", status=EStoryStatus.TODO)
    db_session.add_all([epic, child, sibling])
    await db_session.commit()

    pub = await client.post(
        f"/api/workspaces/{ws.slug}/marketplace/listings/",
        json={"story_id": "epic-a", "title": "Job", "description": ""},
    )
    listing_id = pub.json()["id"]

    await client.post(
        "/api/auth/sign-up/",
        json={"display_name": "Freelancer", "email": "freelancer@test.com", "password": "s3cret!"},
    )
    bid = await client.post(
        f"/api/marketplace/listings/{listing_id}/bids/",
        json={"amount_cents": 1000, "message": "bid"},
    )
    bid_id = bid.json()["id"]

    await client.post("/api/auth/sign-in/", json={"email": "owner@test.com", "password": "s3cret!"})
    accept = await client.post(
        f"/api/workspaces/{ws.slug}/marketplace/listings/{listing_id}/bids/{bid_id}/accept/"
    )
    contract_id = accept.json()["id"]

    await client.post("/api/auth/sign-in/", json={"email": "freelancer@test.com", "password": "s3cret!"})
    return ws, project, child, sibling, contract_id


async def test_contractor_can_read_granted_story(client, db_session):
    ws, project, child, _sibling, _contract = await _setup(client, db_session)
    r = await client.get(
        f"/api/workspaces/{ws.slug}/projects/{project.id}/stories/{child.id}/"
    )
    assert r.status_code == 200


async def test_contractor_blocked_on_sibling_story(client, db_session):
    ws, project, _child, sibling, _contract = await _setup(client, db_session)
    r = await client.get(
        f"/api/workspaces/{ws.slug}/projects/{project.id}/stories/{sibling.id}/"
    )
    assert r.status_code == 404  # fails closed as not-found, doesn't confirm the story exists


async def test_contractor_can_list_story_documents(client, db_session):
    ws, project, child, _sibling, _contract = await _setup(client, db_session)
    r = await client.get(
        f"/api/workspaces/{ws.slug}/projects/{project.id}/stories/{child.id}/documents/"
    )
    assert r.status_code == 200


async def test_contractor_blocked_on_workspace_documents(client, db_session):
    await _setup(client, db_session)
    r = await client.get("/api/workspaces/acme/documents/")
    assert r.status_code == 403


async def test_contractor_can_list_contract_project_documents(client, db_session):
    _ws, _project, _child, _sibling, contract_id = await _setup(client, db_session)
    r = await client.get(f"/api/marketplace/contracts/{contract_id}/documents/")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


async def test_contractor_blocked_on_project_list(client, db_session):
    ws, _project, _child, _sibling, _contract = await _setup(client, db_session)
    r = await client.get(f"/api/workspaces/{ws.slug}/projects/")
    assert r.status_code == 403
