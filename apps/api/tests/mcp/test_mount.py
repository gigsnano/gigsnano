import pytest
from httpx import ASGITransport, AsyncClient

from gigsnano_api.core.security import create_mcp_token


@pytest.mark.asyncio
async def test_mcp_endpoint_requires_auth(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t", follow_redirects=True) as client:
        response = await client.post(
            "/mcp",
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": "t", "version": "1"},
                },
            },
            headers={"Accept": "application/json, text/event-stream"},
        )
        assert response.status_code == 401


@pytest.mark.asyncio
async def test_mcp_no_trailing_slash_does_not_redirect(app, persisted_user):
    """POST /mcp (no slash) must not 307 — clients drop Authorization on redirect."""
    from starlette.testclient import TestClient

    token = create_mcp_token(persisted_user.id, "c_test")
    with TestClient(app, base_url="http://t") as client:
        response = client.post(
            "/mcp",
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": "t", "version": "1"},
                },
            },
            headers={
                "Accept": "application/json, text/event-stream",
                "Authorization": f"Bearer {token}",
            },
            follow_redirects=False,
        )
        assert response.status_code not in (307, 308)
        assert response.status_code == 200
