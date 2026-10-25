import pytest
from httpx import ASGITransport, AsyncClient

from gigsnano_api.auth.deps import ACCESS_COOKIE, REFRESH_COOKIE
from gigsnano_api.core.security import create_token


@pytest.fixture
async def oauth_client(db_session):
    from gigsnano_api.models.oauth import OAuthClient

    client = OAuthClient(
        client_id="c_test",
        client_name="Claude",
        redirect_uris=["http://localhost:8080/cb"],
    )
    db_session.add(client)
    await db_session.commit()
    await db_session.refresh(client)
    return client


@pytest.mark.asyncio
async def test_unauthenticated_redirects_to_signin(app, oauth_client):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t", follow_redirects=False) as client:
        response = await client.get(
            "/oauth/authorize",
            params={
                "response_type": "code",
                "client_id": oauth_client.client_id,
                "redirect_uri": oauth_client.redirect_uris[0],
                "code_challenge": "abc",
                "code_challenge_method": "S256",
                "state": "s",
            },
        )
        assert response.status_code == 302
        assert "/sign-in" in response.headers["location"]


@pytest.mark.asyncio
async def test_authenticated_approve_issues_code(app, oauth_client, persisted_user):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t", follow_redirects=False) as client:
        client.cookies.set(ACCESS_COOKIE, create_token(persisted_user.id, "access"))
        response = await client.post(
            "/oauth/authorize",
            data={
                "response_type": "code",
                "client_id": oauth_client.client_id,
                "redirect_uri": oauth_client.redirect_uris[0],
                "code_challenge": "abc",
                "code_challenge_method": "S256",
                "state": "s",
                "approve": "1",
            },
        )
        assert response.status_code == 302
        location = response.headers["location"]
        assert "code=" in location
        assert "state=s" in location


@pytest.mark.asyncio
async def test_authorize_accepts_refresh_cookie_when_access_expired(app, oauth_client, persisted_user):
    """MCP consent gate must read gn_refresh — access alone expires in 15 min."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t", follow_redirects=False) as client:
        client.cookies.set(REFRESH_COOKIE, create_token(persisted_user.id, "refresh"))
        response = await client.get(
            "/oauth/authorize",
            params={
                "response_type": "code",
                "client_id": oauth_client.client_id,
                "redirect_uri": oauth_client.redirect_uris[0],
                "code_challenge": "abc",
                "code_challenge_method": "S256",
                "state": "s",
            },
        )
        assert response.status_code == 200
        assert "Allow access" in response.text or oauth_client.client_name in response.text
