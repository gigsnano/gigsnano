import pytest
from httpx import ASGITransport, AsyncClient

from gigsnano_api.app import create_app


@pytest.mark.asyncio
async def test_register_client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as client:
        response = await client.post(
            "/oauth/register",
            json={"client_name": "Claude", "redirect_uris": ["http://localhost:8080/cb"]},
        )
        assert response.status_code == 201
        body = response.json()
        assert body["client_id"]
        assert body["token_endpoint_auth_method"] == "none"
