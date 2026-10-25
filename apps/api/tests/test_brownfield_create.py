from gigsnano_api.sync.github_oauth import FakeGitHubOAuth, GitHubOAuthError


async def setup_ws(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})


async def test_brownfield_create_persists_repo_and_pends_clone(client):
    await setup_ws(client)
    res = await client.post("/api/workspaces/acme/projects/", json={
        "name": "Legacy", "identifier": "LEG", "flow": "existing", "has_ui": True,
        "cover_image_url": "https://img.test/c.jpg",
        "repo_full_name": "acme/docs",
    })
    proj = res.json()
    assert proj["repo_full_name"] == "acme/docs"
    assert proj["clone_status"] in ("pending", "cloning", "ready")


async def test_fresh_create_ignores_repo_full_name(client):
    """Fresh-flow creates are unaffected even if a repo_full_name is (incorrectly) sent."""
    await setup_ws(client)
    res = await client.post("/api/workspaces/acme/projects/", json={
        "name": "Fresh One", "identifier": "FRE", "flow": "fresh", "has_ui": True,
        "cover_image_url": "https://img.test/c.jpg",
        "repo_full_name": "acme/docs",
    })
    proj = res.json()
    assert proj["clone_status"] == "none"


async def test_brownfield_create_unknown_repo_skips_clone(client):
    """A repo_full_name that the (fake) installation doesn't have is ignored gracefully."""
    await setup_ws(client)
    res = await client.post("/api/workspaces/acme/projects/", json={
        "name": "Legacy2", "identifier": "LG2", "flow": "existing", "has_ui": True,
        "cover_image_url": "https://img.test/c.jpg",
        "repo_full_name": "nope/not-real",
    })
    assert res.status_code == 201
    proj = res.json()
    assert proj["repo_full_name"] is None
    assert proj["clone_status"] == "none"


async def test_brownfield_create_survives_github_list_repos_error(app, client):
    """A GitHub blip/rate-limit while resolving the repo must not roll back
    project creation — repo resolution degrades gracefully like the clone."""

    class ExplodingGitHubOAuth(FakeGitHubOAuth):
        async def list_repos(self, token: str):
            raise GitHubOAuthError("boom")

    app.state.github_oauth = ExplodingGitHubOAuth()
    await setup_ws(client)
    res = await client.post("/api/workspaces/acme/projects/", json={
        "name": "Legacy3", "identifier": "LG3", "flow": "existing", "has_ui": True,
        "cover_image_url": "https://img.test/c.jpg",
        "repo_full_name": "acme/docs",
    })
    assert res.status_code == 201
    proj = res.json()
    assert proj["repo_full_name"] is None
    assert proj["clone_status"] == "none"
