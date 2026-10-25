import base64
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient

from gigsnano_api.app import create_app
from gigsnano_api.core.security import decode_mcp_token
from gigsnano_api.models.oauth import OAuthAuthorizationCode, OAuthClient


def _pkce() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(48)
    challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    )
    return verifier, challenge


@pytest.fixture
async def issue_auth_code(db_session, make_user):
    user = make_user()
    db_session.add(user)
    await db_session.flush()
    client = OAuthClient(
        client_id="c_pkce",
        client_name="Test",
        redirect_uris=["http://localhost:8080/cb"],
    )
    db_session.add(client)
    await db_session.flush()
    verifier, challenge = _pkce()
    code = secrets.token_urlsafe(32)
    db_session.add(
        OAuthAuthorizationCode(
            code=code,
            client_id=client.client_id,
            user_id=user.id,
            redirect_uri=client.redirect_uris[0],
            code_challenge=challenge,
            scope="mcp",
            expires_at=datetime.now(timezone.utc) + timedelta(seconds=60),
            used=False,
        )
    )
    await db_session.commit()
    return code, verifier, client.client_id, client.redirect_uris[0]


@pytest.mark.asyncio
async def test_code_exchange_with_pkce(issue_auth_code, app):
    code, verifier, client_id, redirect_uri = issue_auth_code
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as client:
        response = await client.post(
            "/oauth/token",
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
                "client_id": client_id,
                "code_verifier": verifier,
            },
        )
        assert response.status_code == 200
        body = response.json()
        assert body["token_type"] == "Bearer"
        assert decode_mcp_token(body["access_token"])["client_id"] == client_id
        assert body["refresh_token"]


@pytest.mark.asyncio
async def test_refresh_token_grant(issue_auth_code, app):
    code, verifier, client_id, redirect_uri = issue_auth_code
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as client:
        first = await client.post(
            "/oauth/token",
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
                "client_id": client_id,
                "code_verifier": verifier,
            },
        )
        refresh = first.json()["refresh_token"]
        second = await client.post(
            "/oauth/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh,
                "client_id": client_id,
            },
        )
        assert second.status_code == 200
        assert second.json()["access_token"]
        assert second.json()["refresh_token"] != refresh
