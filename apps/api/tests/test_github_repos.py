from gigsnano_api.sync.github_state import sign_state

# The `app` fixture forces app.state.github_oauth = FakeGitHubOAuth(), whose
# list_repos returns acme/docs + acme/mobile-app and whose exchange_code returns
# a sentinel token — so these tests exercise the OAuth flow with no network.


async def setup_ws(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})


async def _current_user_id(client) -> str:
    return (await client.get("/api/auth/me/")).json()["id"]


async def connect_github(client, user_id: str):
    """Complete the OAuth callback so the workspace has a stored (fake) token."""
    state = sign_state("acme", user_id)
    return await client.post(
        "/api/workspaces/acme/github/oauth/callback/", json={"code": "any", "state": state}
    )


async def test_repos_requires_connection(client):
    await setup_ws(client)
    res = await client.get("/api/workspaces/acme/github/repos/")
    assert res.status_code == 409  # Connect GitHub first


async def test_repos_lists_repos_after_oauth(client):
    await setup_ws(client)
    connected = await connect_github(client, await _current_user_id(client))
    assert connected.status_code == 200 and connected.json()["connected"] is True
    res = await client.get("/api/workspaces/acme/github/repos/")
    assert res.status_code == 200
    assert any(r["full_name"] == "acme/docs" for r in res.json())


async def test_authorize_url_returns_github_url(client):
    await setup_ws(client)
    res = await client.get("/api/workspaces/acme/github/install-url/")
    assert res.status_code == 200
    assert "github.com/login/oauth/authorize" in res.json()["url"]


async def test_oauth_callback_rejects_user_mismatch(client):
    await setup_ws(client)
    # State signed for the right workspace but a different (non-initiating) user id.
    state = sign_state("acme", "someone-else")
    res = await client.post(
        "/api/workspaces/acme/github/oauth/callback/", json={"code": "x", "state": state}
    )
    assert res.status_code == 400


async def test_clone_retry_requires_repo(client):
    await setup_ws(client)
    project = (await client.post("/api/workspaces/acme/projects/", json={
        "name": "App", "identifier": "APP", "flow": "fresh",
        "cover_image_url": "https://img.test/c.jpg",
    })).json()
    res = await client.post(f"/api/workspaces/acme/projects/{project['id']}/clone/retry/")
    assert res.status_code == 409


async def _make_fresh_project(client, identifier="APP"):
    return (await client.post("/api/workspaces/acme/projects/", json={
        "name": "App", "identifier": identifier, "flow": "fresh",
        "cover_image_url": "https://img.test/c.jpg",
    })).json()


async def test_link_repo_requires_connection(client):
    await setup_ws(client)
    project = await _make_fresh_project(client)
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/link-repo/",
        json={"repo_full_name": "acme/docs"},
    )
    assert res.status_code == 409  # Connect GitHub first


async def test_link_repo_sets_repo_and_schedules_clone(client):
    await setup_ws(client)
    await connect_github(client, await _current_user_id(client))
    project = await _make_fresh_project(client)
    assert project["repo_full_name"] is None

    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/link-repo/",
        json={"repo_full_name": "acme/mobile-app"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["repo_full_name"] == "acme/mobile-app"
    assert body["clone_status"] == "pending"


async def test_link_repo_can_change_an_existing_link(client):
    await setup_ws(client)
    await connect_github(client, await _current_user_id(client))
    project = await _make_fresh_project(client)
    await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/link-repo/",
        json={"repo_full_name": "acme/docs"},
    )
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/link-repo/",
        json={"repo_full_name": "acme/mobile-app"},
    )
    assert res.status_code == 200
    assert res.json()["repo_full_name"] == "acme/mobile-app"


async def test_link_repo_rejects_unknown_repo(client):
    await setup_ws(client)
    await connect_github(client, await _current_user_id(client))
    project = await _make_fresh_project(client)
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/link-repo/",
        json={"repo_full_name": "nobody/does-not-exist"},
    )
    assert res.status_code == 404
