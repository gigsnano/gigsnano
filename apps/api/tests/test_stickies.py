async def setup_ws(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!"})
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})


async def test_stickies_crud(client):
    await setup_ws(client)
    base = "/api/workspaces/acme/stickies/"
    assert (await client.get(base)).json() == []

    res = await client.post(base, json={})  # empty body allowed
    assert res.status_code == 201
    s = res.json()
    assert set(s) == {"id", "workspace_slug", "body", "color", "created_at", "updated_at"}
    assert s["body"] == "" and s["color"] == "#fbbf24"

    patched = (await client.patch(f"{base}{s['id']}/",
                                  json={"body": "  buy milk  ", "color": "#ff0000"})).json()
    assert patched["body"] == "buy milk" and patched["color"] == "#ff0000"

    res = await client.delete(f"{base}{s['id']}/")
    assert res.status_code == 204 and res.content == b""
    assert (await client.get(base)).json() == []


async def test_stickies_tenant_scope(client):
    await setup_ws(client)
    sid = (await client.post("/api/workspaces/acme/stickies/", json={"body": "x"})).json()["id"]
    await client.post("/api/workspaces/", json={"name": "Beta", "slug": "beta"})
    assert (await client.get("/api/workspaces/beta/stickies/")).json() == []
    assert (await client.delete(f"/api/workspaces/beta/stickies/{sid}/")).status_code == 404
