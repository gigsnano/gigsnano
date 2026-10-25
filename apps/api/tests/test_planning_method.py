"""GIN-330: project planning method — Automatic default, RBAC-gated changes,
audited, and never rewrites historical estimates."""

from tests.test_stories import setup_project


async def _sign_in(client, email):
    await client.post("/api/auth/sign-out/")
    r = await client.post("/api/auth/sign-in/", json={"email": email, "password": "s3cret!"})
    assert r.status_code == 200


async def test_new_project_defaults_to_automatic(client):
    project = await setup_project(client)
    got = (await client.get(f"/api/workspaces/acme/projects/{project['id']}/")).json()
    assert got["planning_method"] == "automatic"
    assert got["planning_method_updated_at"] is None


async def test_owner_can_change_method_and_it_is_stamped(client):
    project = await setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}"
    res = await client.patch(base + "/", json={"planning_method": "points"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["planning_method"] == "points"
    assert body["planning_method_updated_at"] is not None
    # Recorded in the project activity/audit feed.
    acts = (await client.get(base + "/activity/")).json()
    assert any("planning method" in a["action"] for a in acts)


async def test_change_method_does_not_touch_estimates(client):
    project = await setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}"
    story = (await client.post(f"{base}/stories/", json={"title": "Sized"})).json()
    await client.patch(f"{base}/stories/{story['id']}/", json={"estimate_points": 5})

    await client.patch(base + "/", json={"planning_method": "time"})

    got = (await client.get(f"{base}/stories/{story['id']}/")).json()
    assert got["estimate_points"] == 5  # historical estimate preserved


async def test_project_member_cannot_change_method(client):
    # Ada owns the project; Bob is a plain project MEMBER (not admin/owner).
    await client.post("/api/auth/sign-up/", json={"display_name": "Bob", "email": "bob@x.test", "password": "s3cret!"})
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-up/", json={"display_name": "Ada", "email": "ada@x.test", "password": "s3cret!"})
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    bob_ws = (await client.post("/api/workspaces/acme/members/", json={"email": "bob@x.test"})).json()
    await _sign_in(client, "bob@x.test")
    await client.patch(f"/api/workspaces/acme/members/{bob_ws['id']}/", json={"accept": True})
    await _sign_in(client, "ada@x.test")
    project = (await client.post("/api/workspaces/acme/projects/", json={
        "name": "App", "identifier": "APP", "flow": "fresh", "has_ui": False,
        "cover_image_url": "https://img.test/c.jpg"})).json()
    await client.post(f"/api/workspaces/acme/projects/{project['id']}/members/",
                      json={"user_id": bob_ws["user_id"], "role": "member"})

    await _sign_in(client, "bob@x.test")
    res = await client.patch(f"/api/workspaces/acme/projects/{project['id']}/",
                             json={"planning_method": "points"})
    assert res.status_code == 403
