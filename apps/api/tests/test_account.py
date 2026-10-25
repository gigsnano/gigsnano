async def signed_in(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": "ada@example.test", "password": "s3cret!",
    })


async def test_patch_me_updates_editable_fields(app, client):
    await signed_in(client)
    res = await client.patch("/api/auth/me/", json={
        "display_name": "Ada Lovelace", "email_digest": False, "product_updates": False,
    })
    assert res.status_code == 200
    b = res.json()
    assert b["display_name"] == "Ada Lovelace"
    assert b["email_digest"] is False
    assert b["product_updates"] is False
    # email is not editable via this endpoint
    assert b["email"] == "ada@example.test"


async def test_patch_me_ignores_blank_display_name(app, client):
    await signed_in(client)
    res = await client.patch("/api/auth/me/", json={"display_name": "   "})
    assert res.status_code == 200
    assert res.json()["display_name"] == "Ada"


async def test_patch_me_requires_auth(app, client):
    res = await client.patch("/api/auth/me/", json={"display_name": "X"})
    assert res.status_code == 401


async def test_change_password_then_new_password_works(app, client):
    await signed_in(client)
    res = await client.post("/api/auth/change-password/", json={
        "current_password": "s3cret!", "new_password": "n3wpass!",
    })
    assert res.status_code == 200 and res.json() == {"success": True}
    await client.post("/api/auth/sign-out/")
    ok = await client.post("/api/auth/sign-in/", json={
        "email": "ada@example.test", "password": "n3wpass!"})
    assert ok.status_code == 200


async def test_change_password_wrong_current_400(app, client):
    await signed_in(client)
    res = await client.post("/api/auth/change-password/", json={
        "current_password": "WRONG", "new_password": "n3wpass!"})
    assert res.status_code == 400


async def test_change_password_too_short_400(app, client):
    await signed_in(client)
    res = await client.post("/api/auth/change-password/", json={
        "current_password": "s3cret!", "new_password": "short"})
    assert res.status_code == 400
