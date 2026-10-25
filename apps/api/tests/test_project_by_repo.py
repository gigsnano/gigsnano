async def test_by_repo_matches_connected_project(client):
    # NOTE: deviates from the task brief's literal payload — CreateProjectPayload
    # requires `cover_image_url`, and repo resolution only persists
    # `repo_full_name` when it matches an installation repo returned by
    # FakeGitHubOAuth.list_repos ("acme/docs" / "acme/mobile-app" — see
    # tests/test_brownfield_create.py), so "acme/web" would silently no-op.
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": "ada@example.test", "password": "s3cret!"})
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    project = (await client.post("/api/workspaces/acme/projects/", json={
        "name": "Web", "identifier": "WEB", "flow": "existing",
        "cover_image_url": "https://img.test/c.jpg",
        "repo_full_name": "acme/docs"})).json()
    assert project["repo_full_name"] == "acme/docs"
    res = await client.get("/api/projects/by-repo", params={"full_name": "ACME/Docs"})
    assert res.status_code == 200
    body = res.json()
    assert body["project_id"] == project["id"]
    assert body["workspace_slug"] == "acme"
    assert body["identifier"] == "WEB"

async def test_by_repo_no_match_404(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": "ada@example.test", "password": "s3cret!"})
    res = await client.get("/api/projects/by-repo", params={"full_name": "nobody/none"})
    assert res.status_code == 404
