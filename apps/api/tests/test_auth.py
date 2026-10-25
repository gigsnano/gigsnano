SIGNUP = {"display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!"}


async def test_sign_up_returns_auth_user_and_sets_cookies(client):
    res = await client.post("/api/auth/sign-up/", json=SIGNUP)
    assert res.status_code == 201
    body = res.json()
    assert body["email"] == "ada@example.test"
    assert body["display_name"] == "Ada Lovelace"
    assert body["last_workspace_slug"] is None
    assert "password" not in body and "password_hash" not in body
    assert "gn_access" in res.cookies
    assert "gn_refresh" in res.cookies


async def test_sign_up_duplicate_email_conflicts(client):
    await client.post("/api/auth/sign-up/", json=SIGNUP)
    res = await client.post("/api/auth/sign-up/", json=SIGNUP)
    assert res.status_code == 409


async def test_sign_in_wrong_password_unauthorized(client):
    await client.post("/api/auth/sign-up/", json=SIGNUP)
    res = await client.post(
        "/api/auth/sign-in/", json={"email": "ada@example.test", "password": "nope"}
    )
    assert res.status_code == 401


async def test_me_requires_auth(client):
    res = await client.get("/api/auth/me/")
    assert res.status_code == 401


async def test_me_after_sign_in(client):
    await client.post("/api/auth/sign-up/", json=SIGNUP)
    res = await client.get("/api/auth/me/")  # cookies persist on the client
    assert res.status_code == 200
    assert res.json()["email"] == "ada@example.test"


async def test_refresh_reissues_access_cookie(client):
    await client.post("/api/auth/sign-up/", json=SIGNUP)
    res = await client.post("/api/auth/refresh/")
    assert res.status_code == 200
    assert "gn_access" in res.cookies


async def test_sign_out_clears_session(client):
    await client.post("/api/auth/sign-up/", json=SIGNUP)
    await client.post("/api/auth/sign-out/")
    res = await client.get("/api/auth/me/")
    assert res.status_code == 401


async def test_sign_out_clearing_cookie_mirrors_set_attributes(client, monkeypatch):
    """In a cross-site deployment the auth cookies are `SameSite=None; Secure`.
    The clearing Set-Cookie must carry the same attributes or the browser
    rejects it and the session survives (user appears never to sign out)."""
    from gigsnano_api.core.config import settings

    monkeypatch.setattr(settings, "cookie_samesite", "none")
    monkeypatch.setattr(settings, "cookie_secure", True)

    await client.post("/api/auth/sign-up/", json=SIGNUP)
    res = await client.post("/api/auth/sign-out/")

    set_cookies = "\n".join(
        v for k, v in res.headers.multi_items() if k.lower() == "set-cookie"
    )
    clearing = [line for line in set_cookies.splitlines() if line.startswith("gn_access=")]
    assert clearing, "sign-out did not emit a clearing header for gn_access"
    header = clearing[0].lower()
    assert "samesite=none" in header
    assert "secure" in header


async def test_sign_in_google_only_account_rejected(client, monkeypatch):
    from gigsnano_api.auth import router as auth_router
    from gigsnano_api.auth.google import GoogleIdentity
    from gigsnano_api.core.config import settings

    monkeypatch.setattr(settings, "google_client_id", "cid")
    monkeypatch.setattr(
        auth_router,
        "verify_google_credential",
        lambda t: GoogleIdentity(
            sub="s1", email="g@x.test", email_verified=True, name="G", picture=None
        ),
    )
    await client.post("/api/auth/google/", json={"id_token": "t"})
    await client.post("/api/auth/sign-out/")
    res = await client.post(
        "/api/auth/sign-in/", json={"email": "g@x.test", "password": "anything"}
    )
    assert res.status_code == 401
