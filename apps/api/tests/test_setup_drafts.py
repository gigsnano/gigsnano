from datetime import timedelta

from gigsnano_api.core.config import settings
from gigsnano_api.core.db import utcnow
from gigsnano_api.models import SetupDraft


async def _enable(monkeypatch, slug="acme"):
    monkeypatch.setattr(settings, "solutions_enabled", True)
    monkeypatch.setattr(settings, "solution_workspace_allowlist", slug)


async def _ws(client, email="ada@example.test", slug="acme"):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": email, "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": slug})


async def test_create_and_list_own_drafts(client, monkeypatch):
    await _enable(monkeypatch)
    await _ws(client)
    created = (await client.post("/api/workspaces/acme/setup-drafts/", json={
        "solution_key": "software_delivery", "starting_point": "idea",
    })).json()
    assert created["revision"] == 1
    assert created["solution_version"] == 1
    assert created["starting_point"] == "idea"
    listed = (await client.get("/api/workspaces/acme/setup-drafts/")).json()
    assert [d["id"] for d in listed] == [created["id"]]


async def test_create_rejects_disabled_and_unknown(client, monkeypatch):
    await _enable(monkeypatch)
    await _ws(client)
    ra = await client.post("/api/workspaces/acme/setup-drafts/", json={
        "solution_key": "revenue_assurance",
    })
    assert ra.status_code == 422
    bad = await client.post("/api/workspaces/acme/setup-drafts/", json={
        "solution_key": "nope",
    })
    assert bad.status_code == 422


async def test_create_rejects_outside_cohort(client, monkeypatch):
    monkeypatch.setattr(settings, "solutions_enabled", False)
    await _ws(client)
    res = await client.post("/api/workspaces/acme/setup-drafts/", json={
        "solution_key": "software_delivery",
    })
    assert res.status_code == 422


async def test_patch_increments_revision_and_conflicts(client, monkeypatch):
    await _enable(monkeypatch)
    await _ws(client)
    draft = (await client.post("/api/workspaces/acme/setup-drafts/", json={
        "solution_key": "software_delivery",
    })).json()
    ok = await client.patch(
        f"/api/workspaces/acme/setup-drafts/{draft['id']}/",
        json={"revision": 1, "step": "context", "values": {"name": "Acme"}},
    )
    assert ok.status_code == 200 and ok.json()["revision"] == 2
    stale = await client.patch(
        f"/api/workspaces/acme/setup-drafts/{draft['id']}/",
        json={"revision": 1, "step": "other"},
    )
    assert stale.status_code == 409


async def test_other_user_draft_is_404(client, monkeypatch):
    await _enable(monkeypatch)
    await _ws(client, email="ada@example.test")
    draft = (await client.post("/api/workspaces/acme/setup-drafts/", json={
        "solution_key": "software_delivery",
    })).json()
    bob = (await client.post("/api/auth/sign-up/", json={
        "display_name": "Bob", "email": "bob@example.test", "password": "s3cret!",
    })).json()
    await client.post("/api/auth/sign-out/")
    await client.post(
        "/api/auth/sign-in/", json={"email": "ada@example.test", "password": "s3cret!"}
    )
    await client.post("/api/workspaces/acme/members/", json={"user_id": bob["id"]})
    await client.post("/api/auth/sign-out/")
    await client.post(
        "/api/auth/sign-in/", json={"email": "bob@example.test", "password": "s3cret!"}
    )
    listed = (await client.get("/api/workspaces/acme/setup-drafts/")).json()
    assert listed == []
    patch = await client.patch(
        f"/api/workspaces/acme/setup-drafts/{draft['id']}/",
        json={"revision": 1, "step": "x"},
    )
    assert patch.status_code == 404


async def test_expired_draft_behaves_as_missing(client, monkeypatch, db_session):
    await _enable(monkeypatch)
    await _ws(client)
    draft = (await client.post("/api/workspaces/acme/setup-drafts/", json={
        "solution_key": "software_delivery",
    })).json()
    row = await db_session.get(SetupDraft, draft["id"])
    row.expires_at = utcnow() - timedelta(days=1)
    await db_session.commit()
    listed = (await client.get("/api/workspaces/acme/setup-drafts/")).json()
    assert listed == []
    patch = await client.patch(
        f"/api/workspaces/acme/setup-drafts/{draft['id']}/",
        json={"revision": 1, "step": "x"},
    )
    assert patch.status_code == 404


async def test_delete_own_draft(client, monkeypatch):
    await _enable(monkeypatch)
    await _ws(client)
    draft = (await client.post("/api/workspaces/acme/setup-drafts/", json={
        "solution_key": "software_delivery",
    })).json()
    res = await client.delete(f"/api/workspaces/acme/setup-drafts/{draft['id']}/")
    assert res.status_code == 200 and res.json() == {"success": True}
    assert (await client.get("/api/workspaces/acme/setup-drafts/")).json() == []
