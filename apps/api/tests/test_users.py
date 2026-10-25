async def sign_up(client, email="ada@example.test", name="Ada Lovelace"):
    res = await client.post("/api/auth/sign-up/", json={
        "display_name": name, "email": email, "password": "s3cret!",
    })
    assert res.status_code == 201
    return res.json()


async def test_list_users_requires_auth(client):
    res = await client.get("/api/users/")
    assert res.status_code == 401


async def test_list_users_returns_iuser_shape(client):
    me = await sign_up(client)
    await sign_up(client, "alan@example.test", "Alan Turing")  # a second directory entry
    res = await client.get("/api/users/")
    assert res.status_code == 200
    body = res.json()["items"]  # OffsetPageOut envelope
    assert {u["email"] for u in body} == {"ada@example.test", "alan@example.test"}
    row = next(u for u in body if u["email"] == "ada@example.test")
    assert set(row) == {"id", "display_name", "email", "avatar_url"}
    assert row["id"] == me["id"]
    assert "password" not in row and "password_hash" not in row


async def test_get_user_by_id(client):
    me = await sign_up(client)
    res = await client.get(f"/api/users/{me['id']}/")
    assert res.status_code == 200
    assert res.json()["email"] == "ada@example.test"


async def test_get_unknown_user_404(client):
    await sign_up(client)
    res = await client.get("/api/users/nope/")
    assert res.status_code == 404
