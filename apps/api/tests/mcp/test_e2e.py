import inspect
import json

import gigsnano_api.mcp_server.tools  # noqa: F401 — register tools


def _hdr(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json, text/event-stream",
        "Content-Type": "application/json",
    }


def _extract_tool_names(body: str) -> list[str]:
    payload = json.loads(body)
    if "result" in payload and "tools" in payload["result"]:
        return [tool["name"] for tool in payload["result"]["tools"]]
    if "error" in payload:
        raise AssertionError(payload["error"])
    raise AssertionError(f"Unexpected MCP response: {body[:500]}")


def test_tools_list_matches_the_exported_roster(mcp_test_client, pat_for_user):
    mcp_test_client.post(
        "/mcp/",
        headers=_hdr(pat_for_user.token),
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
        headers=_hdr(pat_for_user.token),
        json={"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
    )
    assert response.status_code == 200
    names = _extract_tool_names(response.text)
    # Asserted against the tools actually registered on the module rather than a
    # hard-coded count: the literal went stale the first time a tool was added and
    # stayed red, which taught everyone to ignore it.
    from gigsnano_api.mcp_server import tools as tools_module

    registered = {
        name
        for name, obj in vars(tools_module).items()
        if not name.startswith("_")
        and inspect.iscoroutinefunction(obj)
        # Defined anywhere in the tools package — the tools live in per-domain
        # submodules and are re-exported flat by tools/__init__.py.
        and obj.__module__.startswith(tools_module.__name__)
    }
    assert set(names) == registered


def test_tools_call_get_work_item(mcp_test_client, pat_for_user, seed_story):
    mcp_test_client.post(
        "/mcp/",
        headers=_hdr(pat_for_user.token),
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
        headers=_hdr(pat_for_user.token),
        json={
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {"name": "get_work_item", "arguments": {"code": seed_story.code}},
        },
    )
    assert response.status_code == 200
    payload = json.loads(response.text)
    assert "result" in payload
    assert seed_story.code in json.dumps(payload["result"])


def test_tools_call_requires_auth(mcp_test_client, seed_story):
    response = mcp_test_client.post(
        "/mcp/",
        json={
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {"name": "get_work_item", "arguments": {"code": seed_story.code}},
        },
        headers={"Accept": "application/json, text/event-stream", "Content-Type": "application/json"},
    )
    assert response.status_code == 401
