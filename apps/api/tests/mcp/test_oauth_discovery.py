import pytest
from httpx import ASGITransport, AsyncClient

from gigsnano_api.app import create_app


@pytest.mark.asyncio
async def test_metadata():
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://mcp.gigsnano.com") as client:
        metadata = (await client.get("/.well-known/oauth-authorization-server")).json()
        assert metadata["code_challenge_methods_supported"] == ["S256"]
        assert metadata["authorization_endpoint"].endswith("/oauth/authorize")
        protected = (await client.get("/.well-known/oauth-protected-resource")).json()
        assert protected["resource"].endswith("/mcp")
        # RFC 9728 suffixed path advertised in the 401 WWW-Authenticate hint
        suffixed = await client.get("/.well-known/oauth-protected-resource/mcp")
        assert suffixed.status_code == 200
        assert suffixed.json() == protected


@pytest.mark.asyncio
async def test_metadata_uses_public_base_url(monkeypatch):
    from gigsnano_api.core.config import settings

    monkeypatch.setattr(settings, "public_base_url", "https://mcp.gigsnano.com")
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://localhost") as client:
        metadata = (await client.get("/.well-known/oauth-authorization-server")).json()
        assert metadata["issuer"] == "https://mcp.gigsnano.com"
        assert metadata["authorization_endpoint"] == "https://mcp.gigsnano.com/oauth/authorize"


@pytest.mark.asyncio
async def test_metadata_uses_frontend_when_split_domain(monkeypatch):
    from gigsnano_api.core.config import settings

    monkeypatch.setattr(settings, "public_base_url", "https://mcp.gigsnano.com")
    monkeypatch.setattr(settings, "frontend_url", "https://app.gigsnano.com")
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://localhost") as client:
        metadata = (await client.get("/.well-known/oauth-authorization-server")).json()
        assert metadata["issuer"] == "https://app.gigsnano.com"
        assert metadata["authorization_endpoint"] == "https://app.gigsnano.com/oauth/authorize"


@pytest.mark.asyncio
async def test_authorize_signin_next_uses_frontend_when_split_domain(
    client, monkeypatch, make_user, db_session
):
    """Unauth authorize must return to the frontend proxy origin, not the bare MCP host."""
    from gigsnano_api.core.config import settings
    from gigsnano_api.models.oauth import OAuthClient

    monkeypatch.setattr(settings, "public_base_url", "https://mcp.gigsnano.com")
    monkeypatch.setattr(settings, "frontend_url", "https://app.gigsnano.com")
    db_session.add(OAuthClient(client_id="c_test", client_name="t", redirect_uris=["http://cb/x"]))
    await db_session.commit()

    resp = await client.get(
        "/oauth/authorize",
        params={
            "response_type": "code",
            "client_id": "c_test",
            "redirect_uri": "http://cb/x",
            "code_challenge": "abc",
            "code_challenge_method": "S256",
        },
        follow_redirects=False,
    )
    assert resp.status_code == 302
    assert "next=https%3A%2F%2Fapp.gigsnano.com%2Foauth%2Fauthorize" in resp.headers["location"]


@pytest.mark.asyncio
async def test_authorize_signin_next_uses_public_origin_when_unified(client, monkeypatch, db_session):
    """When frontend and public base match, sign-in next stays on that origin."""
    from gigsnano_api.core.config import settings
    from gigsnano_api.models.oauth import OAuthClient

    monkeypatch.setattr(settings, "public_base_url", "https://app.gigsnano.com")
    monkeypatch.setattr(settings, "frontend_url", "https://app.gigsnano.com")
    db_session.add(OAuthClient(client_id="c_test", client_name="t", redirect_uris=["http://cb/x"]))
    await db_session.commit()

    resp = await client.get(
        "/oauth/authorize",
        params={
            "response_type": "code",
            "client_id": "c_test",
            "redirect_uri": "http://cb/x",
            "code_challenge": "abc",
            "code_challenge_method": "S256",
        },
        follow_redirects=False,
    )
    assert resp.status_code == 302
    assert "next=https%3A%2F%2Fapp.gigsnano.com%2Foauth%2Fauthorize" in resp.headers["location"]
