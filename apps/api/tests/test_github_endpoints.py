from gigsnano_api.sync.github_client import FakeGitHubClient, RepoInfo


async def setup_ws(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})


async def test_status_disconnected_by_default(client):
    await setup_ws(client)
    res = await client.get("/api/workspaces/acme/github/")
    assert res.json() == {"connected": False, "repo_url": None}


async def test_connect_resolves_repo_and_wires_workspace(app, client):
    app.state.github_client = FakeGitHubClient(repos=[
        RepoInfo("ada/product-docs", "https://github.com/ada/product-docs", "main"),
    ])
    await setup_ws(client)
    res = await client.post(
        "/api/workspaces/acme/github/connect/", json={"repo_name": "product-docs"}
    )
    assert res.status_code == 200
    assert res.json() == {
        "connected": True, "repo_url": "https://github.com/ada/product-docs",
    }

    ws = (await client.get("/api/workspaces/acme/")).json()
    assert ws["github_connected"] is True
    assert ws["github_repo_url"] == "https://github.com/ada/product-docs"


async def test_connect_unknown_repo_422(app, client):
    app.state.github_client = FakeGitHubClient(repos=[
        RepoInfo("ada/product-docs", "https://github.com/ada/product-docs", "main"),
    ])
    await setup_ws(client)
    res = await client.post(
        "/api/workspaces/acme/github/connect/", json={"repo_name": "nope"}
    )
    assert res.status_code == 422


async def test_disconnect(app, client):
    app.state.github_client = FakeGitHubClient()
    await setup_ws(client)
    await client.post("/api/workspaces/acme/github/connect/", json={"repo_name": "docs"})
    res = await client.post("/api/workspaces/acme/github/disconnect/")
    assert res.json() == {"success": True}
    status = (await client.get("/api/workspaces/acme/github/")).json()
    assert status["connected"] is False


async def test_trigger_sync_requires_admin(app, client):
    """A plain workspace member (not admin/owner) must not be able to push docs to
    the repo — trigger_sync is gated like connect/disconnect."""
    app.state.github_client = FakeGitHubClient()
    # Alan exists but will be a plain member; Ada owns 'acme'.
    alan = (await client.post("/api/auth/sign-up/", json={
        "display_name": "Alan Turing", "email": "alan@example.test", "password": "s3cret!",
    })).json()
    await client.post("/api/auth/sign-out/")
    await setup_ws(client)  # Ada signs up + creates 'acme'
    await client.post("/api/workspaces/acme/github/connect/", json={"repo_name": "docs"})
    project = (await client.post("/api/workspaces/acme/projects/", json={
        "name": "App", "identifier": "APP", "flow": "fresh",
        "cover_image_url": "https://img.test/c.jpg",
    })).json()
    await client.post("/api/workspaces/acme/members/", json={"user_id": alan["id"]})
    # Add Alan as a project member (but not admin) to test that the endpoint gate checks admin role
    await client.post(f"/api/workspaces/acme/projects/{project['id']}/members/", json={"user_id": alan["id"]})
    await client.post("/api/auth/sign-out/")

    await client.post(
        "/api/auth/sign-in/", json={"email": "alan@example.test", "password": "s3cret!"}
    )
    res = await client.post(f"/api/workspaces/acme/projects/{project['id']}/sync/")
    assert res.status_code == 403
