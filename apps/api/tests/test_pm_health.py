"""GIN-337: PM-reported health is versioned, permission-gated, audited, and never
changes system-calculated health."""

from tests.test_stories import setup_project


async def _post(client, project_id, **fields):
    body = {"reported_status": "at_risk", "narrative": "Vendor slip; mitigating.", **fields}
    return await client.post(f"/api/workspaces/acme/projects/{project_id}/pm-health/", json=body)


async def test_create_and_latest(client):
    project = await setup_project(client)
    pid = project["id"]
    res = await _post(client, pid, reported_status="off_track", narrative="Blocked on API.")
    assert res.status_code == 201, res.text
    latest = (await client.get(f"/api/workspaces/acme/projects/{pid}/pm-health/latest/")).json()
    assert latest["reported_status"] == "off_track"
    assert latest["narrative"] == "Blocked on API."
    assert latest["author_name"]  # author retained


async def test_history_retains_versions_newest_first(client):
    project = await setup_project(client)
    pid = project["id"]
    await _post(client, pid, narrative="v1")
    await _post(client, pid, narrative="v2")
    history = (await client.get(f"/api/workspaces/acme/projects/{pid}/pm-health/")).json()
    assert [h["narrative"] for h in history] == ["v2", "v1"]  # newest first, both kept
    latest = (await client.get(f"/api/workspaces/acme/projects/{pid}/pm-health/latest/")).json()
    assert latest["narrative"] == "v2"


async def test_retract_keeps_history_but_drops_from_latest(client):
    project = await setup_project(client)
    pid = project["id"]
    await _post(client, pid, narrative="v1")
    v2 = (await _post(client, pid, narrative="v2")).json()

    del_res = await client.delete(f"/api/workspaces/acme/projects/{pid}/pm-health/{v2['id']}/")
    assert del_res.status_code == 200
    latest = (await client.get(f"/api/workspaces/acme/projects/{pid}/pm-health/latest/")).json()
    assert latest["narrative"] == "v1"  # falls back to the prior version
    history = (await client.get(f"/api/workspaces/acme/projects/{pid}/pm-health/")).json()
    assert len(history) == 2  # retracted version still in history


async def test_pm_update_never_changes_system_health(client):
    project = await setup_project(client)
    pid = project["id"]
    before = (await client.get(f"/api/workspaces/acme/projects/{pid}/forecasting/health/")).json()
    await _post(client, pid, reported_status="on_track", narrative="All good per PM.")
    after = (await client.get(f"/api/workspaces/acme/projects/{pid}/forecasting/health/")).json()
    # PM judgment lives in a separate store; system status is unaffected.
    assert before["status"] == after["status"] == "no_data"


async def test_recovery_owner_must_be_active_member(client):
    project = await setup_project(client)
    pid = project["id"]
    res = await _post(client, pid, recovery_owner_id="00000000-0000-0000-0000-000000000000")
    assert res.status_code == 400


async def test_unknown_project_404(client):
    await setup_project(client)
    res = await _post(client, "00000000-0000-0000-0000-000000000000")
    assert res.status_code == 404


async def test_no_pm_update_yet_returns_null_latest(client):
    project = await setup_project(client)
    res = await client.get(f"/api/workspaces/acme/projects/{project['id']}/pm-health/latest/")
    assert res.status_code == 200
    assert res.json() is None


async def _sign_in(client, email):
    await client.post("/api/auth/sign-out/")
    r = await client.post("/api/auth/sign-in/", json={"email": email, "password": "s3cret!"})
    assert r.status_code == 200


async def test_project_viewer_cannot_post_pm_update(client):
    # Ada owns the project; Bob is added as a project VIEWER.
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
                      json={"user_id": bob_ws["user_id"], "role": "viewer"})

    await _sign_in(client, "bob@x.test")
    res = await client.post(f"/api/workspaces/acme/projects/{project['id']}/pm-health/",
                            json={"reported_status": "on_track", "narrative": "sneaky"})
    assert res.status_code == 403
