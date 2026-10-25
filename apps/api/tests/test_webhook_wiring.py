async def setup_project(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!"})
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    return (await client.post("/api/workspaces/acme/projects/", json={
        "name": "App", "identifier": "APP", "flow": "fresh",
        "cover_image_url": "https://img.test/c.jpg",
    })).json()


async def test_create_story_dispatches_story_created(client, monkeypatch):
    events = []

    async def rec(db, wid, slug, event, data, **kwargs):
        events.append(event)

    monkeypatch.setattr("gigsnano_api.features.stories.router.dispatch_event", rec)
    monkeypatch.setattr(
        "gigsnano_api.features.stories.router.dispatch_sprint_completed_if_transitioned",
        lambda *a, **k: _noop(),
    )
    project = await setup_project(client)
    events.clear()  # ignore anything from project/Sprint-0 seeding
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/stories/", json={"title": "Task"}
    )
    assert res.status_code == 201
    assert events == ["story.created"]


async def test_update_story_dispatches_updated_and_assigned(client, monkeypatch):
    events = []

    async def rec(db, wid, slug, event, data, **kwargs):
        events.append(event)

    monkeypatch.setattr("gigsnano_api.features.stories.router.dispatch_event", rec)
    monkeypatch.setattr(
        "gigsnano_api.features.stories.router.dispatch_sprint_completed_if_transitioned",
        lambda *a, **k: _noop(),
    )
    # Alan will be the assignee.
    alan = (await client.post("/api/auth/sign-up/", json={
        "display_name": "Alan Turing", "email": "alan@example.test", "password": "s3cret!",
    })).json()
    await client.post("/api/auth/sign-out/")
    project = await setup_project(client)  # Ada owns acme
    await client.post("/api/workspaces/acme/members/", json={"user_id": alan["id"]})
    story = (await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/stories/", json={"title": "Task"}
    )).json()
    url = f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}/"

    events.clear()
    await client.patch(url, json={"title": "Renamed"})
    assert events == ["story.updated"]  # non-assignment change → updated only

    events.clear()
    await client.patch(url, json={"assignee_id": alan["id"]})
    assert events.count("story.updated") == 1 and "story.assigned" in events


async def _noop():
    return None
