from sqlalchemy import func, select

from gigsnano_api.auth import mobile_router
from gigsnano_api.auth.apple import AppleIdentity
from gigsnano_api.auth.google import GoogleIdentity
from gigsnano_api.auth.models import User
from gigsnano_api.core.config import settings
from gigsnano_api.core.security import create_token

SIGNUP = {"display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!"}


async def _signed_up_user_id(client) -> str:
    res = await client.post("/api/auth/sign-up/", json=SIGNUP)
    client.cookies.clear()  # prove the bearer header alone authenticates
    return res.json()["id"]


async def test_bearer_access_jwt_authenticates(client):
    uid = await _signed_up_user_id(client)
    token = create_token(uid, "access")
    res = await client.get("/api/auth/me/", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert res.json()["email"] == SIGNUP["email"]


async def test_bearer_refresh_jwt_is_not_an_access_token(client):
    uid = await _signed_up_user_id(client)
    token = create_token(uid, "refresh")
    res = await client.get("/api/auth/me/", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401


async def test_bearer_garbage_rejected(client):
    await _signed_up_user_id(client)
    res = await client.get("/api/auth/me/", headers={"Authorization": "Bearer not-a-token"})
    assert res.status_code == 401



async def _signed_up(client):
    await client.post("/api/auth/sign-up/", json=SIGNUP)
    client.cookies.clear()


async def _login(client) -> dict:
    res = await client.post(
        "/api/auth/mobile/login/",
        json={"email": SIGNUP["email"], "password": SIGNUP["password"], "device_name": "Pixel"},
    )
    assert res.status_code == 200, res.text
    return res.json()


async def test_login_returns_tokens_that_authenticate(client):
    await _signed_up(client)
    body = await _login(client)
    assert body["token_type"] == "Bearer"
    assert body["user"]["email"] == SIGNUP["email"]
    assert "gn_access" not in client.cookies  # mobile never gets cookies
    me = await client.get(
        "/api/auth/me/", headers={"Authorization": f"Bearer {body['access_token']}"}
    )
    assert me.status_code == 200


async def test_login_wrong_password(client):
    await _signed_up(client)
    res = await client.post(
        "/api/auth/mobile/login/", json={"email": SIGNUP["email"], "password": "nope"}
    )
    assert res.status_code == 401


async def test_login_suspended(client, db_session):
    await _signed_up(client)
    user = (await db_session.execute(select(User))).scalar_one()
    user.is_suspended = True
    await db_session.commit()
    res = await client.post(
        "/api/auth/mobile/login/",
        json={"email": SIGNUP["email"], "password": SIGNUP["password"]},
    )
    assert res.status_code == 403


async def test_refresh_rotates_and_reuse_kills_the_session(client):
    await _signed_up(client)
    first = await _login(client)

    res = await client.post(
        "/api/auth/mobile/refresh/", json={"refresh_token": first["refresh_token"]}
    )
    assert res.status_code == 200
    second = res.json()
    assert second["refresh_token"] != first["refresh_token"]

    replay = await client.post(
        "/api/auth/mobile/refresh/", json={"refresh_token": first["refresh_token"]}
    )
    assert replay.status_code == 401
    assert replay.json()["detail"]["code"] == "invalid_refresh"
    after = await client.post(
        "/api/auth/mobile/refresh/", json={"refresh_token": second["refresh_token"]}
    )
    assert after.status_code == 401


async def test_logout_revokes(client):
    await _signed_up(client)
    body = await _login(client)
    res = await client.post(
        "/api/auth/mobile/logout/", json={"refresh_token": body["refresh_token"]}
    )
    assert res.status_code == 204
    res = await client.post(
        "/api/auth/mobile/refresh/", json={"refresh_token": body["refresh_token"]}
    )
    assert res.status_code == 401


async def test_google_existing_user_links_and_signs_in(client, monkeypatch):
    await _signed_up(client)
    monkeypatch.setattr(settings, "google_client_id", "web-cid")
    monkeypatch.setattr(
        mobile_router,
        "verify_google_credential",
        lambda t: GoogleIdentity(
            sub="g-1", email=SIGNUP["email"], email_verified=True, name="Ada", picture=None
        ),
    )
    res = await client.post("/api/auth/mobile/google/", json={"id_token": "x"})
    assert res.status_code == 200
    assert res.json()["user"]["email"] == SIGNUP["email"]


async def test_google_unknown_identity_never_creates_an_account(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "web-cid")
    monkeypatch.setattr(
        mobile_router,
        "verify_google_credential",
        lambda t: GoogleIdentity(
            sub="g-2", email="new@example.test", email_verified=True, name=None, picture=None
        ),
    )
    res = await client.post("/api/auth/mobile/google/", json={"id_token": "x"})
    assert res.status_code == 404
    assert res.json()["detail"]["code"] == "no_account"
    assert (await db_session.execute(select(func.count()).select_from(User))).scalar_one() == 0


async def test_apple_existing_user_signs_in(client, monkeypatch):
    await _signed_up(client)
    monkeypatch.setattr(settings, "apple_bundle_id", "com.gigsnano.app")
    monkeypatch.setattr(
        mobile_router,
        "verify_apple_identity_token",
        lambda t: AppleIdentity(sub="a-1", email=SIGNUP["email"], email_verified=True),
    )
    res = await client.post("/api/auth/mobile/apple/", json={"identity_token": "x"})
    assert res.status_code == 200


async def test_apple_private_relay_unknown_is_no_account(client, monkeypatch):
    await _signed_up(client)
    monkeypatch.setattr(settings, "apple_bundle_id", "com.gigsnano.app")
    monkeypatch.setattr(
        mobile_router,
        "verify_apple_identity_token",
        lambda t: AppleIdentity(sub="a-2", email="x@privaterelay.appleid.com", email_verified=True),
    )
    res = await client.post("/api/auth/mobile/apple/", json={"identity_token": "x"})
    assert res.status_code == 404


async def test_apple_not_configured(client, monkeypatch):
    monkeypatch.setattr(settings, "apple_bundle_id", "")
    res = await client.post("/api/auth/mobile/apple/", json={"identity_token": "x"})
    assert res.status_code == 503


async def test_google_unverified_email_does_not_link(client, db_session, monkeypatch):
    from gigsnano_api.auth.identity import find_user_for_google

    await _signed_up(client)
    identity = GoogleIdentity(
        sub="g-9", email=SIGNUP["email"], email_verified=False, name=None, picture=None
    )
    assert await find_user_for_google(db_session, identity) is None
    user = (await db_session.execute(select(User))).scalar_one()
    assert user.google_sub is None


async def test_mobile_google_with_different_linked_sub_is_no_account(client, monkeypatch):
    await _signed_up(client)
    monkeypatch.setattr(settings, "google_client_id", "web-cid")
    for sub, expected in (("g-A", 200), ("g-B", 404)):
        monkeypatch.setattr(
            mobile_router,
            "verify_google_credential",
            lambda t, sub=sub: GoogleIdentity(
                sub=sub, email=SIGNUP["email"], email_verified=True, name=None, picture=None
            ),
        )
        res = await client.post("/api/auth/mobile/google/", json={"id_token": "x"})
        assert res.status_code == expected
    assert res.json()["detail"]["code"] == "no_account"


async def test_mobile_apple_with_different_linked_sub_is_no_account(client, monkeypatch):
    await _signed_up(client)
    monkeypatch.setattr(settings, "apple_bundle_id", "com.gigsnano.app")
    for sub, expected in (("a-A", 200), ("a-B", 404)):
        monkeypatch.setattr(
            mobile_router,
            "verify_apple_identity_token",
            lambda t, sub=sub: AppleIdentity(sub=sub, email=SIGNUP["email"], email_verified=True),
        )
        res = await client.post("/api/auth/mobile/apple/", json={"identity_token": "x"})
        assert res.status_code == expected


async def test_web_google_with_different_linked_sub_is_401_and_creates_nothing(
    client, db_session, monkeypatch
):
    from gigsnano_api.auth import router as auth_router

    await _signed_up(client)
    monkeypatch.setattr(settings, "google_client_id", "web-cid")
    for sub, expected in (("g-A", 200), ("g-B", 401)):
        monkeypatch.setattr(
            auth_router,
            "verify_google_credential",
            lambda t, sub=sub: GoogleIdentity(
                sub=sub, email=SIGNUP["email"], email_verified=True, name=None, picture=None
            ),
        )
        res = await client.post("/api/auth/google/", json={"id_token": "x"})
        assert res.status_code == expected, res.text
    assert (await db_session.execute(select(func.count()).select_from(User))).scalar_one() == 1
