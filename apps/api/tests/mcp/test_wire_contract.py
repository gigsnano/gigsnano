"""GIN-370: wire-level MCP contract regression suite.

These drive the real published transport (initialize + tools/call over the MCP
HTTP endpoint), not the tool functions directly — so they catch FastMCP
annotation, output-schema and serialization regressions that unit tests miss.
"""

import json

import pytest


def _hdr(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json, text/event-stream",
        "Content-Type": "application/json",
    }


def _init(client, token: str) -> None:
    client.post(
        "/mcp/",
        headers=_hdr(token),
        json={
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "wire", "version": "1"},
            },
        },
    )


def _call(client, token: str, name: str, arguments: dict) -> dict:
    r = client.post(
        "/mcp/",
        headers=_hdr(token),
        json={
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {"name": name, "arguments": arguments},
        },
    )
    assert r.status_code == 200
    return json.loads(r.text)["result"]


def _payload(result: dict):
    """The tool's native return, unwrapped from FastMCP's structuredContent."""
    return result["structuredContent"]["result"]


def test_structured_content_is_native_not_stringified(mcp_test_client, pat_for_user, seed_story):
    # GIN-370 AC1: the crown-jewel regression. If a tool reverts to json.dumps(),
    # structuredContent.result becomes a STRING and this fails.
    _init(mcp_test_client, pat_for_user.token)
    result = _call(mcp_test_client, pat_for_user.token, "get_work_item", {"code": seed_story.code})

    body = _payload(result)
    assert isinstance(body, dict), "structuredContent must be a native object, not a JSON string"
    assert body["code"] == seed_story.code
    assert isinstance(body["title"], str) and not body["title"].lstrip().startswith("{")

    # the human-readable text block is real serialized JSON, parseable to the same item
    text_block = json.loads(result["content"][0]["text"])
    assert text_block["code"] == seed_story.code
    assert result["isError"] is False


def test_search_ranks_exact_code_first_via_transport(mcp_test_client, pat_for_user, seed_project):
    # GIN-370 (pins GIN-365): exact-code search ranks first + carries match evidence.
    _init(mcp_test_client, pat_for_user.token)
    created = _payload(
        _call(
            mcp_test_client,
            pat_for_user.token,
            "create_work_item",
            {"project": seed_project.id, "title": "Wire ranking probe"},
        )
    )
    code = created["code"]

    hits = _payload(_call(mcp_test_client, pat_for_user.token, "search_work_items", {"q": code}))
    assert hits["items"][0]["code"] == code
    assert "code" in hits["items"][0]["matched_fields"]
    assert hits["items"][0]["relevance_score"] == 1.0


def test_idempotent_create_via_transport(mcp_test_client, pat_for_user, seed_project):
    # GIN-370 (pins GIN-368): a retried create with the same key files no duplicate.
    _init(mcp_test_client, pat_for_user.token)
    args = {"project": seed_project.id, "title": "Idempotent wire", "idempotency_key": "wire-1"}
    a = _payload(_call(mcp_test_client, pat_for_user.token, "create_work_item", args))
    b = _payload(_call(mcp_test_client, pat_for_user.token, "create_work_item", args))
    assert a["code"] == b["code"]

    found = _payload(
        _call(mcp_test_client, pat_for_user.token, "search_work_items", {"q": "Idempotent wire"})
    )
    assert len([s for s in found["items"] if s["title"] == "Idempotent wire"]) == 1


def test_stale_write_conflict_via_transport(mcp_test_client, pat_for_user, seed_story):
    # GIN-370 (pins GIN-368): a stale optimistic-concurrency write is an error, not
    # a silent overwrite, and the structured code reaches the client.
    _init(mcp_test_client, pat_for_user.token)
    result = _call(
        mcp_test_client,
        pat_for_user.token,
        "update_work_item",
        {"code": seed_story.code, "title": "x", "expected_updated_at": "2000-01-01T00:00:00+00:00"},
    )
    assert result["isError"] is True
    assert "stale_write" in json.dumps(result["content"])


def test_context_tool_bounded_via_transport(mcp_test_client, pat_for_user, seed_story):
    # GIN-370 (pins GIN-369): aggregated context returns bounded collections.
    _init(mcp_test_client, pat_for_user.token)
    ctx = _payload(
        _call(mcp_test_client, pat_for_user.token, "get_work_item_context", {"code": seed_story.code})
    )
    assert ctx["work_item"]["code"] == seed_story.code
    assert {"total", "returned", "truncated", "items"} <= set(ctx["children"])
    assert ctx["snapshot_consistent"] is False


def _rpc(client, token: str, method: str, params: dict | None = None) -> dict:
    r = client.post(
        "/mcp/",
        headers=_hdr(token),
        json={"jsonrpc": "2.0", "id": 3, "method": method, "params": params or {}},
    )
    assert r.status_code == 200, r.text
    return json.loads(r.text)["result"]


def test_tools_list_declares_read_and_write_over_the_wire(mcp_test_client, pat_for_user):
    # GIN-392: the connection screen groups by annotations.readOnlyHint. Before this,
    # every tool arrived unannotated and rendered as a write action.
    _init(mcp_test_client, pat_for_user.token)
    tools = _rpc(mcp_test_client, pat_for_user.token, "tools/list")["tools"]
    by_name = {t["name"]: t for t in tools}
    assert by_name["list_work_items"]["annotations"]["readOnlyHint"] is True
    assert by_name["update_work_item"]["annotations"]["readOnlyHint"] is False
    assert by_name["delete_cycle"]["annotations"]["destructiveHint"] is True
    assert all(t.get("annotations", {}).get("readOnlyHint") is not None for t in tools)


def test_prompts_list_publishes_registry_skills(mcp_test_client, pat_for_user):
    # GIN-392: skills reach the client as prompts (its "Skills" group), not as two
    # more API actions. Empty registry is still a valid, non-erroring list.
    _init(mcp_test_client, pat_for_user.token)
    result = _rpc(mcp_test_client, pat_for_user.token, "prompts/list")
    assert isinstance(result["prompts"], list)
