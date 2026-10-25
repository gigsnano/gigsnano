"""Portal-facing PAT management: create (plaintext shown once), list (metadata
only, never plaintext/hash), revoke (idempotent, 404 on cross-user access)."""


async def _signup(client):
    await client.post(
        "/api/auth/sign-up/",
        json={"display_name": "Ada", "email": "ada@example.test", "password": "s3cret!"},
    )


async def test_create_list_revoke_token(client):
    await _signup(client)
    created = (await client.post("/api/auth/tokens/", json={"name": "cli"})).json()
    assert created["token"].startswith("gnp_")

    listing = (await client.get("/api/auth/tokens/")).json()
    assert len(listing) == 1
    assert "token" not in listing[0] and "token_hash" not in listing[0]

    # The issued token actually authenticates.
    client.cookies.clear()
    me = await client.get("/api/auth/me/", headers={"Authorization": f"Bearer {created['token']}"})
    assert me.status_code == 200

    # Revoke, then it stops working.
    await client.post("/api/auth/sign-in/", json={"email": "ada@example.test", "password": "s3cret!"})
    assert (await client.delete(f"/api/auth/tokens/{created['id']}/")).status_code == 204
    client.cookies.clear()
    dead = await client.get("/api/auth/me/", headers={"Authorization": f"Bearer {created['token']}"})
    assert dead.status_code == 401


async def test_create_requires_auth(client):
    client.cookies.clear()
    res = await client.post("/api/auth/tokens/", json={"name": "cli"})
    assert res.status_code == 401


async def test_revoke_is_idempotent(client):
    await _signup(client)
    created = (await client.post("/api/auth/tokens/", json={"name": "cli"})).json()
    first = await client.delete(f"/api/auth/tokens/{created['id']}/")
    second = await client.delete(f"/api/auth/tokens/{created['id']}/")
    assert first.status_code == 204
    assert second.status_code == 204


async def test_revoke_other_users_token_returns_404(client):
    await _signup(client)
    created = (await client.post("/api/auth/tokens/", json={"name": "cli"})).json()

    client.cookies.clear()
    await client.post(
        "/api/auth/sign-up/",
        json={"display_name": "Bob", "email": "bob@example.test", "password": "s3cret!"},
    )
    res = await client.delete(f"/api/auth/tokens/{created['id']}/")
    assert res.status_code == 404


async def test_revoke_unknown_token_returns_404(client):
    await _signup(client)
    res = await client.delete("/api/auth/tokens/does-not-exist/")
    assert res.status_code == 404


async def test_list_only_shows_own_tokens(client):
    await _signup(client)
    await client.post("/api/auth/tokens/", json={"name": "cli"})

    client.cookies.clear()
    await client.post(
        "/api/auth/sign-up/",
        json={"display_name": "Bob", "email": "bob@example.test", "password": "s3cret!"},
    )
    listing = (await client.get("/api/auth/tokens/")).json()
    assert listing == []
