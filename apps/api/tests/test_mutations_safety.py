"""GIN-368: idempotent, concurrency-safe, previewable mutations."""

from tests.test_stories import setup_project


async def _project(client):
    return await setup_project(client)


async def _new_story(client, project_id, **fields):
    return (
        await client.post(
            f"/api/workspaces/acme/projects/{project_id}/stories/",
            json={"title": "Base", **fields},
        )
    ).json()


async def test_create_story_idempotent_retry(client):
    project = await _project(client)
    url = f"/api/workspaces/acme/projects/{project['id']}/stories/"
    r1 = await client.post(url, params={"idempotency_key": "k1"}, json={"title": "Once"})
    r2 = await client.post(url, params={"idempotency_key": "k1"}, json={"title": "Once"})

    assert r1.status_code == 201
    assert r2.json()["id"] == r1.json()["id"]  # replayed, not a second story

    items = (await client.get("/api/workspaces/acme/stories/?q=Once")).json()["items"]
    assert len([s for s in items if s["title"] == "Once"]) == 1


async def test_idempotency_key_conflict_on_different_payload(client):
    project = await _project(client)
    url = f"/api/workspaces/acme/projects/{project['id']}/stories/"
    await client.post(url, params={"idempotency_key": "k2"}, json={"title": "A"})
    r = await client.post(url, params={"idempotency_key": "k2"}, json={"title": "B"})

    assert r.status_code == 409
    assert r.json()["detail"]["error_code"] == "idempotency_key_conflict"
    assert r.json()["detail"]["retryable"] is False


async def test_comment_idempotent_retry(client):
    project = await _project(client)
    story = await _new_story(client, project["id"])
    curl = f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}/comments/"
    await client.post(curl, params={"idempotency_key": "c1"}, json={"body": "hi"})
    await client.post(curl, params={"idempotency_key": "c1"}, json={"body": "hi"})

    comments = (await client.get(curl)).json()
    assert len(comments) == 1


async def test_stale_update_returns_conflict(client):
    project = await _project(client)
    story = await _new_story(client, project["id"], title="T")
    url = f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}/"
    version = story["updated_at"]

    ok = await client.patch(url, params={"expected_updated_at": version}, json={"title": "T2"})
    assert ok.status_code == 200  # version matched → applied, bumps updated_at

    stale = await client.patch(url, params={"expected_updated_at": version}, json={"title": "T3"})
    assert stale.status_code == 409
    assert stale.json()["detail"]["error_code"] == "stale_write"
    assert stale.json()["detail"]["retryable"] is True
    assert "current_updated_at" in stale.json()["detail"]

    # the stale write did NOT overwrite the newer title
    after = (await client.get(url)).json()
    assert after["title"] == "T2"


async def test_dry_run_preview_commits_nothing(client):
    project = await _project(client)
    story = await _new_story(client, project["id"], title="Orig")
    sid = story["id"]
    preview = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{sid}/preview-update/",
        json={"title": "New", "priority": "high"},
    )
    assert preview.status_code == 200
    body = preview.json()
    assert body["dry_run"] is True
    assert set(body["changed_fields"]) == {"title", "priority"}
    assert body["proposed"]["title"] == "New"

    after = (await client.get(f"/api/workspaces/acme/projects/{project['id']}/stories/{sid}/")).json()
    assert after["title"] == "Orig"  # nothing was committed
