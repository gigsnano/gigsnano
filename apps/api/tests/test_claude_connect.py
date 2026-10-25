"""BYO Anthropic API-key connect for Claude Code. Mirrors the Cursor key flow:
verify the key, store it encrypted, and a real key routes dispatch to the real
provider (x-api-key path), not the Fake one."""

import pytest

from gigsnano_api.agent_delegation.provider import resolve_agent_provider
from gigsnano_api.models import EAgentProvider


async def _sign_up(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": "ada@example.test", "password": "s3cret!",
    })


@pytest.mark.asyncio
async def test_connect_claude_api_key(client, monkeypatch):
    async def _fake_verify(_key: str):
        return {"data": [{"id": "claude-haiku-4-5"}]}

    monkeypatch.setattr(
        "gigsnano_api.agent_delegation.router.verify_anthropic_api_key", _fake_verify
    )
    await _sign_up(client)
    res = await client.post(
        "/api/agents/connections/claude/connect/", json={"api_key": "sk-ant-xyz"}
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["provider"] == "claude_code"
    assert body["status"] == "connected"
    assert body["account_label"] == "claude: ada@example.test"

    # It shows up as a usable connection (never leaks the token).
    conns = (await client.get("/api/agents/connections/")).json()
    assert any(c["provider"] == "claude_code" and c["status"] == "connected" for c in conns)
    assert "access_token" not in body and "token" not in body


@pytest.mark.asyncio
async def test_invalid_claude_api_key_rejected(client, monkeypatch):
    import httpx

    async def _bad_verify(_key: str):
        raise httpx.HTTPError("401")

    monkeypatch.setattr(
        "gigsnano_api.agent_delegation.router.verify_anthropic_api_key", _bad_verify
    )
    await _sign_up(client)
    res = await client.post(
        "/api/agents/connections/claude/connect/", json={"api_key": "bad"}
    )
    assert res.status_code == 400
    assert "Anthropic" in res.json()["detail"]


def test_real_key_routes_to_real_claude_provider():
    """A stored API key (real token) dispatches via RealClaudeCodeProvider, not Fake."""
    real = resolve_agent_provider(EAgentProvider.CLAUDE_CODE, access_token="sk-ant-real")
    assert type(real).__name__ == "RealClaudeCodeProvider"
    none = resolve_agent_provider(EAgentProvider.CLAUDE_CODE, access_token=None)
    assert type(none).__name__ == "FakeAgentProvider"
