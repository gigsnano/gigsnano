import base64
import hashlib
import secrets
from datetime import datetime, timezone

import pytest
from httpx import ASGITransport, AsyncClient

from gigsnano_api.auth.deps import ACCESS_COOKIE
from gigsnano_api.core.security import create_token
from gigsnano_api.models.oauth import OAuthRefreshToken
from gigsnano_api.models.tokens import hash_token


def _pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(32)
    challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    )
    return verifier, challenge


@pytest.fixture
async def oauth_client(db_session):
    from gigsnano_api.models.oauth import OAuthClient

    client = OAuthClient(
        client_id="c_grants",
        client_name="Claude Desktop",
        redirect_uris=["http://localhost:8080/cb"],
    )
    db_session.add(client)
    await db_session.commit()
    await db_session.refresh(client)
    return client


@pytest.fixture
async def active_grant(db_session, oauth_client, persisted_user):
    token = secrets.token_urlsafe(48)
    db_session.add(
        OAuthRefreshToken(
            token_hash=hash_token(token),
            client_id=oauth_client.client_id,
            user_id=persisted_user.id,
            scope="mcp",
        )
    )
    await db_session.commit()
    return oauth_client, token


@pytest.mark.asyncio
async def test_list_grants_requires_auth(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as client:
        response = await client.get("/api/oauth/grants/")
        assert response.status_code == 401


@pytest.mark.asyncio
async def test_list_grants_returns_active_clients(app, active_grant, persisted_user):
    oauth_client, _ = active_grant
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as client:
        client.cookies.set(ACCESS_COOKIE, create_token(persisted_user.id, "access"))
        response = await client.get("/api/oauth/grants/")
        assert response.status_code == 200
        grants = response.json()
        assert len(grants) == 1
        assert grants[0]["client_id"] == oauth_client.client_id
        assert grants[0]["client_name"] == "Claude Desktop"
        assert grants[0]["scope"] == "mcp"


@pytest.mark.asyncio
async def test_revoke_grant_invalidates_refresh(app, active_grant, persisted_user):
    oauth_client, refresh_token = active_grant
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as client:
        client.cookies.set(ACCESS_COOKIE, create_token(persisted_user.id, "access"))
        revoke = await client.delete(f"/api/oauth/grants/{oauth_client.client_id}/")
        assert revoke.status_code == 204

        refresh = await client.post(
            "/oauth/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": oauth_client.client_id,
            },
        )
        assert refresh.status_code == 400
        assert refresh.json()["error"] == "invalid_grant"

        listed = await client.get("/api/oauth/grants/")
        assert listed.json() == []


@pytest.mark.asyncio
async def test_consent_shows_signed_in_user(app, oauth_client, persisted_user):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as client:
        client.cookies.set(ACCESS_COOKIE, create_token(persisted_user.id, "access"))
        response = await client.get(
            "/oauth/authorize",
            params={
                "response_type": "code",
                "client_id": oauth_client.client_id,
                "redirect_uri": oauth_client.redirect_uris[0],
                "code_challenge": "abc",
                "code_challenge_method": "S256",
            },
        )
        assert response.status_code == 200
        assert persisted_user.email in response.text
        assert persisted_user.display_name in response.text
        assert "Switch account" in response.text


@pytest.mark.asyncio
async def test_switch_account_clears_cookie_and_redirects(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t", follow_redirects=False) as client:
        client.cookies.set(ACCESS_COOKIE, "stale")
        response = await client.get(
            "/oauth/switch-account",
            params={"next": "http://t/oauth/authorize?x=1"},
        )
        assert response.status_code == 302
        assert "/sign-in" in response.headers["location"]
        set_cookie = response.headers.get("set-cookie", "")
        assert ACCESS_COOKIE in set_cookie
