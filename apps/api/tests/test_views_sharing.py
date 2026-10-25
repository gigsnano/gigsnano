"""GIN-139 — view ownership, share_scope visibility, owner-only writes, favourites."""

CREATE = {
    "name": "Mobile App",
    "identifier": "MBA",
    "flow": "fresh",
    "cover_image_url": "https://img.test/c.jpg",
}


async def _setup_two_member_project(client):
    """Ada (owner) creates acme + project; Alan is a workspace + project member."""
    ada = (
        await client.post(
            "/api/auth/sign-up/",
            json={
                "display_name": "Ada Lovelace",
                "email": "ada@example.test",
                "password": "s3cret!",
            },
        )
    ).json()
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    project = (
        await client.post("/api/workspaces/acme/projects/", json=CREATE)
    ).json()

    alan = (
        await client.post("/api/auth/sign-up/", json={
            "display_name": "Alan Turing",
            "email": "alan@example.test",
            "password": "s3cret!",
        })
    ).json()
    await client.post("/api/auth/sign-out/")
    await client.post(
        "/api/auth/sign-in/", json={"email": "ada@example.test", "password": "s3cret!"}
    )
    await client.post("/api/workspaces/acme/members/", json={"user_id": alan["id"]})
    await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/members/",
        json={"user_id": alan["id"]},
    )
    return project["id"], ada, alan


def _view_keys():
    return {
        "id",
        "workspace_slug",
        "project_id",
        "name",
        "description",
        "layout",
        "filter_query",
        "owner_id",
        "owner_name",
        "share_scope",
        "is_favorite",
        "created_at",
        "updated_at",
    }


async def test_create_view_defaults_private_and_owner(client):
    pid, ada, _alan = await _setup_two_member_project(client)
    base = f"/api/workspaces/acme/projects/{pid}/views/"
    res = await client.post(base, json={"name": "Mine", "layout": "list"})
    assert res.status_code == 201
    view = res.json()
    assert set(view) == _view_keys()
    assert view["share_scope"] == "private"
    assert view["owner_id"] == ada["id"]
    assert view["owner_name"] == "Ada Lovelace"
    assert view["is_favorite"] is False


async def test_private_view_hidden_from_other_members(client):
    pid, _ada, alan = await _setup_two_member_project(client)
    base = f"/api/workspaces/acme/projects/{pid}/views/"
    private = (await client.post(base, json={"name": "Secret", "layout": "list"})).json()

    await client.post("/api/auth/sign-out/")
    await client.post(
        "/api/auth/sign-in/", json={"email": "alan@example.test", "password": "s3cret!"}
    )
    listed = (await client.get(base)).json()
    assert [v["id"] for v in listed] == []

    # Invisible private views return 404 (no existence leak)
    assert (await client.patch(f"{base}{private['id']}/", json={"name": "Hacked"})).status_code == 404
    assert (await client.delete(f"{base}{private['id']}/")).status_code == 404


async def test_project_shared_view_visible_to_members(client):
    pid, _ada, alan = await _setup_two_member_project(client)
    base = f"/api/workspaces/acme/projects/{pid}/views/"
    shared = (
        await client.post(
            base,
            json={"name": "Team board", "layout": "board", "share_scope": "project"},
        )
    ).json()
    assert shared["share_scope"] == "project"

    await client.post("/api/auth/sign-out/")
    await client.post(
        "/api/auth/sign-in/", json={"email": "alan@example.test", "password": "s3cret!"}
    )
    listed = (await client.get(base)).json()
    assert len(listed) == 1
    assert listed[0]["id"] == shared["id"]
    assert listed[0]["owner_name"] == "Ada Lovelace"
    assert listed[0]["is_favorite"] is False


async def test_non_owner_cannot_update_or_delete_shared_view(client):
    pid, _ada, alan = await _setup_two_member_project(client)
    base = f"/api/workspaces/acme/projects/{pid}/views/"
    shared = (
        await client.post(
            base,
            json={"name": "Shared", "layout": "list", "share_scope": "project"},
        )
    ).json()

    await client.post("/api/auth/sign-out/")
    await client.post(
        "/api/auth/sign-in/", json={"email": "alan@example.test", "password": "s3cret!"}
    )
    assert (await client.patch(f"{base}{shared['id']}/", json={"name": "Nope"})).status_code == 403
    assert (await client.delete(f"{base}{shared['id']}/")).status_code == 403


async def test_favorite_toggle_per_user(client):
    pid, _ada, alan = await _setup_two_member_project(client)
    base = f"/api/workspaces/acme/projects/{pid}/views/"
    shared = (
        await client.post(
            base,
            json={"name": "Shared", "layout": "list", "share_scope": "project"},
        )
    ).json()
    fav_url = f"{base}{shared['id']}/favorite/"

    # Ada favorites
    toggled = (await client.post(fav_url)).json()
    assert toggled["is_favorite"] is True
    assert (await client.get(base)).json()[0]["is_favorite"] is True

    # Toggle off
    toggled = (await client.patch(fav_url)).json()
    assert toggled["is_favorite"] is False

    # Alan favorites independently
    await client.post("/api/auth/sign-out/")
    await client.post(
        "/api/auth/sign-in/", json={"email": "alan@example.test", "password": "s3cret!"}
    )
    toggled = (await client.post(fav_url)).json()
    assert toggled["is_favorite"] is True

    # Ada still sees not favorited
    await client.post("/api/auth/sign-out/")
    await client.post(
        "/api/auth/sign-in/", json={"email": "ada@example.test", "password": "s3cret!"}
    )
    assert (await client.get(base)).json()[0]["is_favorite"] is False


def _workspace_view_keys():
    return {
        "id",
        "workspace_slug",
        "name",
        "description",
        "layout",
        "filter_query",
        "owner_id",
        "owner_name",
        "share_scope",
        "is_favorite",
        "created_at",
        "updated_at",
    }


async def test_workspace_view_defaults_private_and_owner(client):
    _, ada, _alan = await _setup_two_member_project(client)
    base = "/api/workspaces/acme/workspace-views/"
    res = await client.post(base, json={"name": "Mine"})
    assert res.status_code == 201
    view = res.json()
    assert set(view) == _workspace_view_keys()
    assert view["share_scope"] == "private"
    assert view["owner_id"] == ada["id"]
    assert view["owner_name"] == "Ada Lovelace"
    assert view["is_favorite"] is False


async def test_workspace_private_view_hidden_from_other_members(client):
    await _setup_two_member_project(client)
    base = "/api/workspaces/acme/workspace-views/"
    private = (await client.post(base, json={"name": "Secret"})).json()

    await client.post("/api/auth/sign-out/")
    await client.post(
        "/api/auth/sign-in/", json={"email": "alan@example.test", "password": "s3cret!"}
    )
    listed = (await client.get(base)).json()
    assert [v["id"] for v in listed] == []
    assert (await client.delete(f"{base}{private['id']}/")).status_code == 404


async def test_workspace_shared_view_visible_to_members(client):
    await _setup_two_member_project(client)
    base = "/api/workspaces/acme/workspace-views/"
    shared = (
        await client.post(
            base,
            json={"name": "Team list", "share_scope": "project"},
        )
    ).json()
    assert shared["share_scope"] == "project"

    await client.post("/api/auth/sign-out/")
    await client.post(
        "/api/auth/sign-in/", json={"email": "alan@example.test", "password": "s3cret!"}
    )
    listed = (await client.get(base)).json()
    assert len(listed) == 1
    assert listed[0]["id"] == shared["id"]
    assert listed[0]["owner_name"] == "Ada Lovelace"


async def test_non_owner_cannot_delete_shared_workspace_view(client):
    await _setup_two_member_project(client)
    base = "/api/workspaces/acme/workspace-views/"
    shared = (
        await client.post(
            base,
            json={"name": "Shared", "share_scope": "project"},
        )
    ).json()

    await client.post("/api/auth/sign-out/")
    await client.post(
        "/api/auth/sign-in/", json={"email": "alan@example.test", "password": "s3cret!"}
    )
    assert (await client.delete(f"{base}{shared['id']}/")).status_code == 403


async def test_cannot_favorite_invisible_private_view(client):
    pid, _ada, alan = await _setup_two_member_project(client)
    base = f"/api/workspaces/acme/projects/{pid}/views/"
    private = (await client.post(base, json={"name": "Hidden", "layout": "list"})).json()

    await client.post("/api/auth/sign-out/")
    await client.post(
        "/api/auth/sign-in/", json={"email": "alan@example.test", "password": "s3cret!"}
    )
    assert (await client.post(f"{base}{private['id']}/favorite/")).status_code == 404
