import json

import pytest

import gigsnano_api.mcp_server.tools  # noqa: F401 — register tools
from gigsnano_api.core.security import create_mcp_token


def _mcp_hdr(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json, text/event-stream",
        "Content-Type": "application/json",
    }


def test_jwt_bearer_authorizes_tools(mcp_test_client, persisted_user):
    token = create_mcp_token(persisted_user.id, "c1")
    mcp_test_client.post(
        "/mcp/",
        headers=_mcp_hdr(token),
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
    )
    response = mcp_test_client.post(
        "/mcp/",
        headers=_mcp_hdr(token),
        json={"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
    )
    assert response.status_code == 200


def test_unauth_mcp_advertises_resource_metadata(mcp_test_client):
    response = mcp_test_client.post(
        "/mcp/",
        json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
        headers={"Accept": "application/json, text/event-stream", "Content-Type": "application/json"},
    )
    assert response.status_code == 401
    www_auth = response.headers.get("www-authenticate", "")
    assert "resource_metadata" in www_auth.lower()


@pytest.mark.asyncio
async def test_mcp_jwt_authorizes_api_route(client, persisted_user):
    token = create_mcp_token(persisted_user.id, "c1")
    client.cookies.clear()
    response = await client.get("/api/workspaces/", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200


def test_pat_still_works_at_mcp(mcp_test_client, pat_for_user):
    mcp_test_client.post(
        "/mcp/",
        headers=_mcp_hdr(pat_for_user.token),
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
    )
    response = mcp_test_client.post(
        "/mcp/",
        headers=_mcp_hdr(pat_for_user.token),
        json={"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
    )
    assert response.status_code == 200
    payload = json.loads(response.text)
    # A lower bound plus a known tool, not a hard count: the literal 31 went stale
    # the first time a tool was added and this test stayed red. The point is that
    # the OAuth-authenticated transport lists a real, non-trivial tool set.
    names = {t["name"] for t in payload["result"]["tools"]}
    assert len(names) >= 30
    assert "get_work_item" in names
