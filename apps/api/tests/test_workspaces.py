async def sign_up(client, email: str, name: str = "Ada Lovelace"):
    res = await client.post(
        "/api/auth/sign-up/",
        json={"display_name": name, "email": email, "password": "s3cret!"},
    )
    assert res.status_code == 201
    return res.json()


async def test_create_workspace_returns_iworkspace_shape(client):
    await sign_up(client, "ada@example.test")
    res = await client.post("/api/workspaces/", json={"name": "Acme Inc.", "slug": "acme"})
    assert res.status_code == 201
    body = res.json()
    assert body["slug"] == "acme"
    assert body["member_count"] == 1  # creator is the owner
    assert body["project_count"] == 0
    assert body["github_connected"] is False
    assert body["github_repo_url"] is None
    assert body["holidays"] == []  # a fresh workspace has no non-working days set
    assert set(body) == {
        "id", "slug", "name", "logo_url", "member_count", "project_count",
        "github_connected", "github_repo_url", "holidays", "created_at", "updated_at",
    }


async def test_duplicate_slug_conflicts(client):
    await sign_up(client, "ada@example.test")
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    res = await client.post("/api/workspaces/", json={"name": "Other", "slug": "acme"})
    assert res.status_code == 409


async def test_list_returns_only_my_workspaces(client):
    await sign_up(client, "ada@example.test")
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    await client.post("/api/auth/sign-out/")

    await sign_up(client, "alan@example.test", name="Alan Turing")
    await client.post("/api/workspaces/", json={"name": "Studio", "slug": "studio"})
    res = await client.get("/api/workspaces/")
    assert [w["slug"] for w in res.json()] == ["studio"]


async def test_get_foreign_workspace_forbidden(client):
    await sign_up(client, "ada@example.test")
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    await client.post("/api/auth/sign-out/")

    await sign_up(client, "alan@example.test", name="Alan Turing")
    res = await client.get("/api/workspaces/acme/")
    assert res.status_code == 403


async def test_unknown_workspace_404(client):
    await sign_up(client, "ada@example.test")
    res = await client.get("/api/workspaces/nope/")
    assert res.status_code == 404


async def test_owner_can_rename_workspace(client):
    # (Non-admin 403 on rename is covered indirectly via require_role's unit path;
    # a member-role rename test needs Task 7's add-member endpoint and lives there.)
    owner = await sign_up(client, "ada@example.test")
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    res = await client.patch("/api/workspaces/acme/", json={"name": "Acme Renamed"})
    assert res.status_code == 200
    assert res.json()["name"] == "Acme Renamed"
    assert owner["email"] == "ada@example.test"
