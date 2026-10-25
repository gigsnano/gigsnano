async def setup_ws(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!"})
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})


async def test_dashboards_crud(client):
    await setup_ws(client)
    base = "/api/workspaces/acme/dashboards/"
    assert (await client.get(base)).json() == []

    res = await client.post(base, json={"name": "  My board  "})
    assert res.status_code == 201
    d = res.json()
    assert set(d) == {
        "id", "workspace_slug", "owner_id", "name", "description",
        "is_favorite", "layout", "config", "created_at", "updated_at",
        # Public sharing (GIN-489) — see test_dashboard_sharing.py.
        "visibility", "public_token", "published_at",
    }
    assert d["visibility"] == "private" and d["public_token"] is None
    assert d["name"] == "My board"  # trimmed
    assert d["is_favorite"] is False
    assert d["layout"] == {"columns": 2} and d["config"] == {"widgets": []}

    # rename + favorite + layout
    patched = (await client.patch(f"{base}{d['id']}/", json={
        "name": "Renamed", "is_favorite": True, "layout": {"columns": 3}})).json()
    assert patched["name"] == "Renamed"
    assert patched["is_favorite"] is True
    assert patched["layout"] == {"columns": 3}

    # get one
    got = (await client.get(f"{base}{d['id']}/")).json()
    assert got["name"] == "Renamed" and got["is_favorite"] is True

    # duplicate carries config, gets "(copy)" name, resets favorite
    dup = (await client.post(f"{base}{d['id']}/duplicate/")).json()
    assert dup["name"] == "Renamed (copy)"
    assert dup["layout"] == {"columns": 3}
    assert dup["is_favorite"] is False
    assert dup["id"] != d["id"]
    assert len((await client.get(base)).json()) == 2

    # delete
    assert (await client.delete(f"{base}{d['id']}/")).status_code == 204
    remaining = (await client.get(base)).json()
    assert [x["id"] for x in remaining] == [dup["id"]]


async def test_dashboards_owner_isolation(client):
    """A different account never sees another owner's dashboards."""
    await setup_ws(client)
    did = (await client.post("/api/workspaces/acme/dashboards/",
                             json={"name": "Ada's"})).json()["id"]

    # second account (fresh sign-up overwrites the session cookie), own workspace
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Bob", "email": "bob@example.test", "password": "s3cret!"})
    await client.post("/api/workspaces/", json={"name": "Beta", "slug": "beta"})
    assert (await client.get("/api/workspaces/beta/dashboards/")).json() == []
    # and Bob is not even a member of acme -> forbidden, never Ada's data
    assert (await client.get("/api/workspaces/acme/dashboards/")).status_code == 403
    assert (await client.get(f"/api/workspaces/beta/dashboards/{did}/")).status_code == 404
