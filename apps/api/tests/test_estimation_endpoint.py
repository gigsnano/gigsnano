"""GIN-332: the estimate-suggestion endpoint suggests from project history, never
persists, and honours the planning method."""

from tests.test_stories import setup_project


async def _set_points_mode(client, pid):
    await client.patch(f"/api/workspaces/acme/projects/{pid}/", json={"planning_method": "points"})


async def test_suggestion_from_completed_history(client):
    project = await setup_project(client)
    pid = project["id"]
    base = f"/api/workspaces/acme/projects/{pid}"
    await _set_points_mode(client, pid)
    # Two completed, points-estimated stories.
    for pts in (5, 8):
        s = (await client.post(f"{base}/stories/", json={"title": f"done {pts}"})).json()
        await client.patch(f"{base}/stories/{s['id']}/", json={"estimate_points": pts})
        await client.patch(f"{base}/stories/{s['id']}/", json={"status": "done"})
    target = (await client.post(f"{base}/stories/", json={"title": "new"})).json()

    body = (await client.get(f"{base}/stories/{target['id']}/estimate-suggestion/")).json()
    assert body["applicable"] is True
    assert body["suggested_value"] in (5, 8)  # snapped median of {5,8}
    assert len(body["similar_item_ids"]) == 2
    assert body["model_version"]
    # Advisory only — target keeps no estimate.
    got = (await client.get(f"{base}/stories/{target['id']}/")).json()
    assert got["estimate_points"] is None


async def test_automatic_mode_not_applicable(client):
    project = await setup_project(client)  # defaults to automatic
    base = f"/api/workspaces/acme/projects/{project['id']}"
    s = (await client.post(f"{base}/stories/", json={"title": "x"})).json()
    body = (await client.get(f"{base}/stories/{s['id']}/estimate-suggestion/")).json()
    assert body["applicable"] is False
    assert body["suggested_value"] is None


async def test_low_data_points_project_no_false_precision(client):
    project = await setup_project(client)
    pid = project["id"]
    await _set_points_mode(client, pid)
    base = f"/api/workspaces/acme/projects/{pid}"
    s = (await client.post(f"{base}/stories/", json={"title": "x"})).json()
    body = (await client.get(f"{base}/stories/{s['id']}/estimate-suggestion/")).json()
    assert body["suggested_value"] is None and body["confidence"] == "none"
