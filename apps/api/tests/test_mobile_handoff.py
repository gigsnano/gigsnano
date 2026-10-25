from datetime import timedelta

import pytest
from sqlalchemy import func, select

from gigsnano_api.auth.handoff import hash_code, pkce_s256
from gigsnano_api.auth.models import User
from gigsnano_api.core.config import settings
from gigsnano_api.core.db import utcnow
from gigsnano_api.core.security import create_token
from gigsnano_api.models import MobileHandoffCode
from gigsnano_api.models.tokens import PersonalAccessToken, generate_token

SIGNUP = {"display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!"}
VERIFIER = "v" * 43 + "-_abc"
CHALLENGE = pkce_s256(VERIFIER)
APP_URI = "gigsnano://auth"
EXPO_URI = "exp://192.168.1.2:8081/--/auth"
CREATE = "/api/auth/mobile/handoff/"
EXCHANGE = "/api/auth/mobile/handoff/exchange/"


async def _signed_in(client):
    res = await client.post("/api/auth/sign-up/", json=SIGNUP)
    assert res.status_code in (200, 201), res.text


async def _create(client, redirect_uri=APP_URI, **overrides):
    body = {
        "code_challenge": CHALLENGE,
        "code_challenge_method": "S256",
        "redirect_uri": redirect_uri,
        **overrides,
    }
    return await client.post(CREATE, json=body)


async def _code(client, redirect_uri=APP_URI) -> str:
    res = await _create(client, redirect_uri)
    assert res.status_code == 200, res.text
    assert res.json()["expires_in"] == 120
    return res.json()["code"]


async def _exchange(client, code, verifier=VERIFIER, redirect_uri=APP_URI):
    client.cookies.clear()
    return await client.post(
        EXCHANGE,
        json={
            "code": code,
            "code_verifier": verifier,
            "redirect_uri": redirect_uri,
            "device_name": "Pixel",
        },
    )


async def _row_count(db_session) -> int:
    return (await db_session.execute(select(func.count()).select_from(MobileHandoffCode))).scalar()


def _assert_invalid_code(res):
    assert res.status_code == 400
    assert res.json()["detail"]["code"] == "invalid_code"


async def test_happy_path_returns_working_tokens(client, db_session):
    await _signed_in(client)
    code = await _code(client)
    row = (await db_session.execute(select(MobileHandoffCode))).scalar_one()
    assert row.code_hash == hash_code(code)  # only the hash is stored
    assert row.code_challenge == CHALLENGE

    res = await _exchange(client, code)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["token_type"] == "Bearer"
    assert body["user"]["email"] == SIGNUP["email"]
    assert "gn_access" not in client.cookies
    me = await client.get(
        "/api/auth/me/", headers={"Authorization": f"Bearer {body['access_token']}"}
    )
    assert me.status_code == 200
    assert await _row_count(db_session) == 0


async def test_expo_go_redirect_round_trip(client):
    await _signed_in(client)
    code = await _code(client, EXPO_URI)
    res = await _exchange(client, code, redirect_uri=EXPO_URI)
    assert res.status_code == 200, res.text


async def test_code_is_single_use(client):
    await _signed_in(client)
    code = await _code(client)
    assert (await _exchange(client, code)).status_code == 200
    _assert_invalid_code(await _exchange(client, code))


async def test_unknown_code(client):
    _assert_invalid_code(await _exchange(client, "nope"))


async def test_expired_code(client, db_session):
    await _signed_in(client)
    code = await _code(client)
    row = (await db_session.execute(select(MobileHandoffCode))).scalar_one()
    row.expires_at = utcnow() - timedelta(seconds=1)
    await db_session.commit()
    _assert_invalid_code(await _exchange(client, code))
    db_session.expire_all()
    assert await _row_count(db_session) == 0


async def test_wrong_verifier_burns_the_code(client, db_session):
    await _signed_in(client)
    code = await _code(client)
    _assert_invalid_code(await _exchange(client, code, verifier="w" * 43))
    db_session.expire_all()
    assert await _row_count(db_session) == 0
    _assert_invalid_code(await _exchange(client, code))


async def test_wrong_length_verifier_burns_the_code(client, db_session):
    await _signed_in(client)
    code = await _code(client)
    _assert_invalid_code(await _exchange(client, code, verifier="v" * 10))
    db_session.expire_all()
    assert await _row_count(db_session) == 0
    _assert_invalid_code(await _exchange(client, code))


async def test_bad_charset_verifier_burns_the_code(client, db_session):
    await _signed_in(client)
    code = await _code(client)
    _assert_invalid_code(await _exchange(client, code, verifier="v" * 42 + "="))
    db_session.expire_all()
    assert await _row_count(db_session) == 0


async def test_redirect_mismatch_burns_the_code(client, db_session):
    await _signed_in(client)
    code = await _code(client)
    _assert_invalid_code(await _exchange(client, code, redirect_uri=EXPO_URI))
    db_session.expire_all()
    assert await _row_count(db_session) == 0
    _assert_invalid_code(await _exchange(client, code))


async def test_create_purges_expired_rows(client, db_session):
    await _signed_in(client)
    await _code(client)
    row = (await db_session.execute(select(MobileHandoffCode))).scalar_one()
    row.expires_at = utcnow() - timedelta(seconds=1)
    await db_session.commit()
    await _code(client)
    db_session.expire_all()
    assert await _row_count(db_session) == 1


@pytest.mark.parametrize(
    "uri",
    [
        "https://evil.example/auth",
        "exp://8.8.8.8:8081/--/auth",
        "exp://evil.example/--/auth",
        "gigsnano://other",
    ],
)
async def test_disallowed_redirect(client, db_session, uri):
    await _signed_in(client)
    res = await _create(client, uri)
    assert res.status_code == 400
    assert res.json()["detail"]["code"] == "invalid_redirect"
    assert await _row_count(db_session) == 0


async def test_expo_go_flag_off_rejects_exp(client, monkeypatch):
    monkeypatch.setattr(settings, "mobile_handoff_allow_expo_go", False)
    await _signed_in(client)
    res = await _create(client, EXPO_URI)
    assert res.status_code == 400
    assert res.json()["detail"]["code"] == "invalid_redirect"


@pytest.mark.parametrize(
    "overrides",
    [
        {"code_challenge_method": "plain"},
        {"code_challenge": "a" * 42},
        {"code_challenge": "a" * 42 + "="},
        {"code_challenge": "a" * 42 + "+"},
    ],
)
async def test_invalid_challenge(client, overrides):
    await _signed_in(client)
    res = await _create(client, **overrides)
    assert res.status_code == 400
    assert res.json()["detail"]["code"] == "invalid_challenge"


async def test_create_requires_a_session(client):
    res = await _create(client)
    assert res.status_code == 401


async def test_create_with_cookie_works(client):
    await _signed_in(client)
    assert "gn_access" in client.cookies
    assert (await _create(client)).status_code == 200


async def test_create_rejects_bearer_access_token_without_cookie(client, db_session):
    await _signed_in(client)
    user = (await db_session.execute(select(User))).scalar_one()
    client.cookies.clear()
    headers = {"Authorization": f"Bearer {create_token(user.id, 'access')}"}
    body = {"code_challenge": CHALLENGE, "code_challenge_method": "S256", "redirect_uri": APP_URI}
    res = await client.post(CREATE, json=body, headers=headers)
    assert res.status_code == 401


async def test_create_rejects_pat_without_cookie(client, db_session):
    await _signed_in(client)
    user = (await db_session.execute(select(User))).scalar_one()
    plaintext, digest = generate_token()
    db_session.add(PersonalAccessToken(user_id=user.id, name="cli", token_hash=digest))
    await db_session.commit()
    client.cookies.clear()
    body = {"code_challenge": CHALLENGE, "code_challenge_method": "S256", "redirect_uri": APP_URI}
    res = await client.post(CREATE, json=body, headers={"Authorization": f"Bearer {plaintext}"})
    assert res.status_code == 401


async def test_suspended_user_cannot_create(client, db_session):
    await _signed_in(client)
    user = (await db_session.execute(select(User))).scalar_one()
    user.is_suspended = True
    await db_session.commit()
    assert (await _create(client)).status_code == 403


async def test_suspended_after_issue_cannot_exchange(client, db_session):
    await _signed_in(client)
    code = await _code(client)
    user = (await db_session.execute(select(User))).scalar_one()
    user.is_suspended = True
    await db_session.commit()
    assert (await _exchange(client, code)).status_code == 403
