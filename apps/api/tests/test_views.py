async def setup_project(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    return (
        await client.post("/api/workspaces/acme/projects/", json={
            "name": "Mobile App", "identifier": "MBA", "flow": "fresh",
            "cover_image_url": "https://img.test/c.jpg",
        })
    ).json()


async def test_project_views_crud(client):
    pid = (await setup_project(client))["id"]
    base = f"/api/workspaces/acme/projects/{pid}/views/"
    assert (await client.get(base)).json() == []

    # Was "priority=high" — a third syntax nothing ever parsed, which round-tripped
    # only because filter_query was unvalidated free text. Such a view showed every
    # item (GIN-175). The grammar is "field:value".
    res = await client.post(base, json={"name": "  My board  ", "layout": "board",
                                        "filter_query": "priority:high"})
    assert res.status_code == 201
    view = res.json()
    assert set(view) == {"id", "workspace_slug", "project_id", "name", "description",
                         "layout", "filter_query", "owner_id", "owner_name",
                         "share_scope", "is_favorite", "created_at", "updated_at"}
    assert view["share_scope"] == "private"
    assert view["is_favorite"] is False
    assert view["name"] == "My board" and view["layout"] == "board"
    assert view["workspace_slug"] == "acme" and view["project_id"] == pid
    vid = view["id"]

    patched = (await client.patch(f"{base}{vid}/",
                                  json={"layout": "table", "name": "Renamed"})).json()
    assert patched["layout"] == "table" and patched["name"] == "Renamed"

    res = await client.delete(f"{base}{vid}/")
    assert res.status_code == 200 and res.json() == {"success": True}
    assert (await client.get(base)).json() == []


async def test_project_view_validation_and_scope(client):
    pid = (await setup_project(client))["id"]
    base = f"/api/workspaces/acme/projects/{pid}/views/"
    assert (await client.post(base, json={"name": "", "layout": "board"})).status_code == 422
    assert (await client.post(base, json={"name": "X", "layout": "nope"})).status_code == 422
    # second workspace cannot reach this project's views
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Alan Turing", "email": "alan@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Beta", "slug": "beta"})
    assert (await client.get(f"/api/workspaces/beta/projects/{pid}/views/")).status_code == 404


async def test_workspace_views_crud_and_defaults(client):
    await setup_project(client)  # signs up + creates workspace "acme"
    base = "/api/workspaces/acme/workspace-views/"
    res = await client.post(base, json={"name": "All work"})  # layout omitted → defaults list
    assert res.status_code == 201
    wv = res.json()
    assert set(wv) == {"id", "workspace_slug", "name", "description", "layout",
                       "filter_query", "owner_id", "owner_name", "share_scope",
                       "is_favorite", "created_at", "updated_at"}
    assert wv["share_scope"] == "private"
    assert wv["is_favorite"] is False
    assert wv["layout"] == "list" and wv["description"] == ""

    assert len((await client.get(base)).json()) == 1

    res = await client.delete(f"{base}{wv['id']}/")
    assert res.status_code == 204
    assert res.content == b""
    assert (await client.get(base)).json() == []

    # no PATCH route on workspace-views
    assert (await client.patch(f"{base}{wv['id']}/", json={"name": "x"})).status_code == 405


async def test_workspace_view_blank_name_422(client):
    await setup_project(client)
    res = await client.post("/api/workspaces/acme/workspace-views/", json={"name": ""})
    assert res.status_code == 422
