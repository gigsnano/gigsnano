async def setup_ws(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!"})
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})


BASE = "/api/workspaces/acme/webhooks/"


async def test_requires_auth(client):
    assert (await client.get(BASE)).status_code == 401


async def test_crud_and_shape(client):
    await setup_ws(client)
    assert (await client.get(BASE)).json() == []

    res = await client.post(BASE, json={"url": "https://hooks.test/x", "events": ["story.created"]})
    assert res.status_code == 201
    wh = res.json()
    assert set(wh) == {
        "id", "workspace_slug", "url", "events", "secret_preview",
        "enabled", "last_delivery", "created_at", "updated_at",
    }
    assert "secret" not in wh
    assert wh["secret_preview"].startswith("whsec_••••••••")
    assert wh["enabled"] is True and wh["last_delivery"] is None
    assert wh["events"] == ["story.created"] and wh["workspace_slug"] == "acme"

    got = (await client.get(f"{BASE}{wh['id']}/")).json()
    assert got["id"] == wh["id"]

    patched = (await client.patch(
        f"{BASE}{wh['id']}/", json={"url": "https://hooks.test/y", "enabled": False}
    )).json()
    assert patched["url"] == "https://hooks.test/y" and patched["enabled"] is False

    res = await client.delete(f"{BASE}{wh['id']}/")
    assert res.status_code == 204 and res.content == b""
    assert (await client.get(BASE)).json() == []


async def test_create_empty_url_is_400(client):
    await setup_ws(client)
    assert (await client.post(BASE, json={"url": "  ", "events": []})).status_code == 400


async def test_patch_empty_url_is_400(client):
    await setup_ws(client)
    wh = (await client.post(BASE, json={"url": "https://h.test/x", "events": []})).json()
    res = await client.patch(f"{BASE}{wh['id']}/", json={"url": "  "})
    assert res.status_code == 400


async def test_create_defaults_events(client):
    await setup_ws(client)
    wh = (await client.post(BASE, json={"url": "https://h.test/x", "events": []})).json()
    assert wh["events"] == ["story.created"]


async def test_unknown_event_is_422(client):
    await setup_ws(client)
    res = await client.post(BASE, json={"url": "https://h.test/x", "events": ["bogus.event"]})
    assert res.status_code == 422


async def test_test_endpoint_records_delivery(client):
    await setup_ws(client)
    wh = (await client.post(
        BASE, json={"url": "https://h.test/x", "events": ["story.created"]}
    )).json()
    res = await client.post(f"{BASE}{wh['id']}/test/")
    assert res.status_code == 200
    d = res.json()
    assert set(d) == {"id", "status", "response_code", "created_at"}
    assert d["status"] == "success" and d["response_code"] == 200
    got = (await client.get(f"{BASE}{wh['id']}/")).json()
    assert got["last_delivery"]["status"] == "success"


async def test_tenant_scope_404(client):
    await setup_ws(client)
    wid = (await client.post(
        BASE, json={"url": "https://h.test/x", "events": ["story.created"]}
    )).json()["id"]
    await client.post("/api/workspaces/", json={"name": "Beta", "slug": "beta"})
    assert (await client.get(f"/api/workspaces/beta/webhooks/{wid}/")).status_code == 404
    assert (await client.get("/api/workspaces/beta/webhooks/")).json() == []


async def test_non_admin_forbidden(client):
    alan = (await client.post("/api/auth/sign-up/", json={
        "display_name": "Alan Turing", "email": "alan@example.test", "password": "s3cret!",
    })).json()
    await client.post("/api/auth/sign-out/")
    await setup_ws(client)  # Ada owns 'acme'
    await client.post("/api/workspaces/acme/members/", json={"user_id": alan["id"]})
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-in/", json={
        "email": "alan@example.test", "password": "s3cret!"})
    assert (await client.get(BASE)).status_code == 403
    assert (await client.post(BASE, json={"url": "https://h.test/x", "events": []})).status_code == 403
