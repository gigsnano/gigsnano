from unittest.mock import patch

import pytest

from gigsnano_api.auth import router as auth_router
from gigsnano_api.auth.google import (
    GoogleIdentity,
    GoogleTokenError,
    verify_google_credential,
)
from gigsnano_api.core.config import settings


def test_verify_returns_identity_from_claims(monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "cid.apps.googleusercontent.com")
    claims = {
        "aud": "cid.apps.googleusercontent.com",
        "sub": "g-1",
        "email": "grace@example.test",
        "email_verified": True,
        "name": "Grace Hopper",
        "picture": "https://img/g.png",
    }
    with patch("gigsnano_api.auth.google.google_id_token.verify_oauth2_token", return_value=claims):
        identity = verify_google_credential("tok")
    assert identity == GoogleIdentity(
        sub="g-1",
        email="grace@example.test",
        email_verified=True,
        name="Grace Hopper",
        picture="https://img/g.png",
    )


def test_verify_accepts_mobile_client_audience(monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "web")
    monkeypatch.setattr(settings, "google_mobile_client_ids", "ios-cid, android-cid")
    claims = {"aud": "android-cid", "sub": "g-3", "email": "a@example.test", "email_verified": True}
    with patch("gigsnano_api.auth.google.google_id_token.verify_oauth2_token", return_value=claims):
        assert verify_google_credential("tok").sub == "g-3"


def test_verify_rejects_foreign_audience(monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "web")
    monkeypatch.setattr(settings, "google_mobile_client_ids", "ios-cid")
    claims = {"aud": "someone-else", "sub": "g-4", "email": "a@example.test"}
    with patch("gigsnano_api.auth.google.google_id_token.verify_oauth2_token", return_value=claims):
        with pytest.raises(GoogleTokenError):
            verify_google_credential("tok")


def test_verify_maps_valueerror_to_token_error(monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "cid")
    with patch(
        "gigsnano_api.auth.google.google_id_token.verify_oauth2_token",
        side_effect=ValueError("bad token"),
    ):
        with pytest.raises(GoogleTokenError):
            verify_google_credential("tok")


def test_verify_requires_configured_client_id(monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "")
    with pytest.raises(RuntimeError):
        verify_google_credential("tok")



def _identity(**kw):
    from gigsnano_api.auth.google import GoogleIdentity

    base = dict(
        sub="g-123",
        email="grace@example.test",
        email_verified=True,
        name="Grace Hopper",
        picture="https://img/g.png",
    )
    base.update(kw)
    return GoogleIdentity(**base)


@pytest.fixture
def google_configured(monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "cid.apps.googleusercontent.com")


async def test_google_creates_new_user(client, monkeypatch, google_configured):
    monkeypatch.setattr(auth_router, "verify_google_credential", lambda t: _identity())
    res = await client.post("/api/auth/google/", json={"id_token": "tok"})
    assert res.status_code == 200
    body = res.json()
    assert body["email"] == "grace@example.test"
    assert body["display_name"] == "Grace Hopper"
    assert body["avatar_url"] == "https://img/g.png"
    assert "gn_access" in res.cookies and "gn_refresh" in res.cookies


async def test_google_logs_in_existing_by_sub(client, monkeypatch, google_configured):
    monkeypatch.setattr(auth_router, "verify_google_credential", lambda t: _identity())
    await client.post("/api/auth/google/", json={"id_token": "tok"})
    res = await client.post("/api/auth/google/", json={"id_token": "tok2"})
    assert res.status_code == 200
    me = await client.get("/api/auth/me/")
    assert me.json()["email"] == "grace@example.test"


async def test_google_links_existing_email_account(client, monkeypatch, google_configured):
    await client.post(
        "/api/auth/sign-up/",
        json={"display_name": "Grace H", "email": "grace@example.test", "password": "pw123456"},
    )
    await client.post("/api/auth/sign-out/")
    monkeypatch.setattr(auth_router, "verify_google_credential", lambda t: _identity())
    res = await client.post("/api/auth/google/", json={"id_token": "tok"})
    assert res.status_code == 200
    assert res.json()["email"] == "grace@example.test"


async def test_google_missing_email_400(client, monkeypatch, google_configured):
    monkeypatch.setattr(auth_router, "verify_google_credential", lambda t: _identity(email=None))
    res = await client.post("/api/auth/google/", json={"id_token": "tok"})
    assert res.status_code == 400


async def test_google_unverified_email_401(client, monkeypatch, google_configured):
    monkeypatch.setattr(
        auth_router, "verify_google_credential", lambda t: _identity(email_verified=False)
    )
    res = await client.post("/api/auth/google/", json={"id_token": "tok"})
    assert res.status_code == 401


async def test_google_invalid_token_401(client, monkeypatch, google_configured):
    def boom(t):
        from gigsnano_api.auth.google import GoogleTokenError

        raise GoogleTokenError("bad")

    monkeypatch.setattr(auth_router, "verify_google_credential", boom)
    res = await client.post("/api/auth/google/", json={"id_token": "tok"})
    assert res.status_code == 401


async def test_google_not_configured_503(client, monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "")
    res = await client.post("/api/auth/google/", json={"id_token": "tok"})
    assert res.status_code == 503
