from tests.test_stories import setup_project


async def test_resolve_by_code(client):
    project = await setup_project(client)  # identifier "MBA"
    created = (await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/stories/",
        json={"title": "Fix login"},
    )).json()
    code = created["code"]  # e.g. "MBA-1"
    res = await client.get(f"/api/workspaces/acme/stories/resolve/{code}")
    assert res.status_code == 200
    assert res.json()["id"] == created["id"]


async def test_resolve_unknown_code_404(client):
    await setup_project(client)
    res = await client.get("/api/workspaces/acme/stories/resolve/MBA-999")
    assert res.status_code == 404


async def test_resolve_by_code_project_scoped(client):
    project = await setup_project(client)
    created = (await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/stories/",
        json={"title": "Fix login"},
    )).json()
    code = created["code"]
    res = await client.get(
        f"/api/workspaces/acme/projects/{project['id']}/stories/resolve/{code}"
    )
    assert res.status_code == 200
    assert res.json()["id"] == created["id"]


async def test_resolve_malformed_code_400(client):
    await setup_project(client)
    res = await client.get("/api/workspaces/acme/stories/resolve/not-a-code-abc")
    assert res.status_code == 400
