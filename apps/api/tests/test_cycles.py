import pytest
from sqlalchemy import event
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool

from gigsnano_api.core.db import Base


@pytest.fixture
async def db_engine():
    """Override the shared conftest fixture: same in-memory sqlite, but with
    foreign_keys enforcement turned on so ON DELETE SET NULL (Story.cycle_id)
    actually fires — sqlite ignores FK ondelete actions unless enabled per
    connection, unlike Postgres (prod) which enforces them natively. Scoped to
    this file only: flipping it on globally breaks unrelated tests elsewhere
    in the suite that rely on sqlite's default lenient FK behavior.
    """
    engine = create_async_engine("sqlite+aiosqlite://", poolclass=StaticPool)

    @event.listens_for(engine.sync_engine, "connect")
    def _enable_sqlite_fk(dbapi_conn, _record):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


async def setup_project(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    return (
        await client.post("/api/workspaces/acme/projects/", json={
            "name": "Mobile App", "identifier": "MBA", "flow": "fresh",
            "cover_image_url": "https://img.test/c.jpg",
        })
    ).json()


async def test_sprint_zero_cycle_listed(client):
    project = await setup_project(client)
    cycles = (await client.get(f"/api/workspaces/acme/projects/{project['id']}/cycles/")).json()
    assert len(cycles) == 1
    assert cycles[0]["is_sprint_zero"] is True
    assert cycles[0]["story_count"] == 10


async def test_create_and_update_cycle(client):
    project = await setup_project(client)
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/cycles/",
        json={"name": "Sprint 1", "start_date": "2026-07-06", "end_date": "2026-07-20"},
    )
    assert res.status_code == 201
    cycle = res.json()
    assert cycle["status"] == "draft"
    assert cycle["is_sprint_zero"] is False

    res = await client.patch(
        f"/api/workspaces/acme/projects/{project['id']}/cycles/{cycle['id']}/",
        json={"status": "active"},
    )
    assert res.json()["status"] == "active"


async def test_cycle_progress_endpoint(client):
    project = await setup_project(client)
    cycles = (await client.get(f"/api/workspaces/acme/projects/{project['id']}/cycles/")).json()
    res = await client.get(
        f"/api/workspaces/acme/projects/{project['id']}/cycles/{cycles[0]['id']}/progress/"
    )
    assert res.status_code == 200
    body = res.json()
    assert body["scope"] == 10
    assert set(body["counts"]) == {"completed", "started", "unstarted", "backlog", "cancelled"}
    assert len(body["burndown"]) >= 2


async def test_cycle_stories_endpoint(client):
    project = await setup_project(client)
    cycles = (await client.get(f"/api/workspaces/acme/projects/{project['id']}/cycles/")).json()
    stories = (
        await client.get(
            f"/api/workspaces/acme/projects/{project['id']}/cycles/{cycles[0]['id']}/stories/"
        )
    ).json()
    assert len(stories) == 10
    assert stories[0]["bmad"]["workflow"] == "track-selection"


async def test_delete_cycle_orphans_stories(client):
    project = await setup_project(client)
    cycles = (await client.get(f"/api/workspaces/acme/projects/{project['id']}/cycles/")).json()
    sprint_zero = cycles[0]

    res = await client.delete(
        f"/api/workspaces/acme/projects/{project['id']}/cycles/{sprint_zero['id']}/"
    )
    assert res.status_code == 200
    assert res.json() == {"success": True}

    # cycle is gone
    gone = await client.get(
        f"/api/workspaces/acme/projects/{project['id']}/cycles/{sprint_zero['id']}/"
    )
    assert gone.status_code == 404

    # its stories survive with cycle_id cleared (SET NULL)
    stories = (
        await client.get(f"/api/workspaces/acme/projects/{project['id']}/stories/")
    ).json()["items"]
    assert len(stories) == 10
    assert all(s["cycle_id"] is None for s in stories)
