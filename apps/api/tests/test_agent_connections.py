import pytest


async def _sign_up(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": "ada@example.test", "password": "s3cret!",
    })


async def _connect_cursor(client, monkeypatch):
    async def _fake_verify(_key: str):
        return {"email": "ada@example.test"}

    monkeypatch.setattr(
        "gigsnano_api.agent_delegation.router.verify_cursor_api_key",
        _fake_verify,
    )
    res = await client.post(
        "/api/agents/connections/cursor/connect/",
        json={"api_key": "cursor_test_key"},
    )
    assert res.status_code == 200
    return res.json()["id"]


@pytest.mark.asyncio
async def test_connect_cursor_api_key_then_list(client, monkeypatch):
    await _sign_up(client)
    res = await client.post(
        "/api/agents/connections/cursor/connect/",
        json={"api_key": "cursor_test_key"},
    )
    assert res.status_code == 400  # without monkeypatch, invalid key

    async def _fake_verify(_key: str):
        return {"email": "ada@example.test"}

    monkeypatch.setattr(
        "gigsnano_api.agent_delegation.router.verify_cursor_api_key",
        _fake_verify,
    )
    res = await client.post(
        "/api/agents/connections/cursor/connect/",
        json={"api_key": "cursor_test_key"},
    )
    assert res.status_code == 200
    assert res.json()["provider"] == "cursor"
    assert res.json()["status"] == "connected"
    lst = await client.get("/api/agents/connections/")
    assert lst.status_code == 200
    rows = lst.json()
    assert len(rows) == 1
    assert "access_token" not in rows[0] and "token" not in rows[0]


@pytest.mark.asyncio
async def test_disconnect(client, monkeypatch):
    await _sign_up(client)
    conn_id = await _connect_cursor(client, monkeypatch)
    res = await client.delete(f"/api/agents/connections/{conn_id}/")
    assert res.status_code == 200
    assert (await client.get("/api/agents/connections/")).json() == []


@pytest.mark.asyncio
async def test_connections_are_per_user(client, app, monkeypatch):
    await _sign_up(client)
    conn_id = await _connect_cursor(client, monkeypatch)

    import httpx

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as other:
        await other.post("/api/auth/sign-up/", json={
            "display_name": "Bo", "email": "bo@example.test", "password": "s3cret!",
        })
        assert (await other.get("/api/agents/connections/")).json() == []

    assert (await client.get("/api/agents/connections/")).json()[0]["id"] == conn_id
