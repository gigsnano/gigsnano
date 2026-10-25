from gigsnano_api.agent_delegation.provider import (
    FAKE_AGENT_TOKEN,
    FakeAgentProvider,
    resolve_agent_provider,
)
from gigsnano_api.models import EAgentProvider


def test_resolve_fake_without_token():
    assert isinstance(
        resolve_agent_provider(EAgentProvider.CURSOR, access_token=None),
        FakeAgentProvider,
    )
    assert isinstance(
        resolve_agent_provider(EAgentProvider.CURSOR, access_token=FAKE_AGENT_TOKEN),
        FakeAgentProvider,
    )


def test_resolve_real_cursor_with_user_api_key():
    from gigsnano_api.agent_delegation.provider_cursor import RealCursorProvider

    assert isinstance(
        resolve_agent_provider(EAgentProvider.CURSOR, access_token="cursor_user_key"),
        RealCursorProvider,
    )


def test_resolve_codex_public_client_for_oauth_exchange(monkeypatch):
    from gigsnano_api.agent_delegation.provider_codex import RealCodexProvider
    from gigsnano_api.core.config import settings

    monkeypatch.setattr(settings, "codex_use_public_client", True)
    assert isinstance(
        resolve_agent_provider(EAgentProvider.CODEX, for_oauth_exchange=True),
        RealCodexProvider,
    )


def test_resolve_claude_for_oauth_exchange(monkeypatch):
    from gigsnano_api.agent_delegation.provider_claude_code import RealClaudeCodeProvider
    from gigsnano_api.core.config import settings

    monkeypatch.setattr(settings, "claude_code_oauth_clientid", "cid")
    monkeypatch.setattr(settings, "claude_code_oauth_clientsecret", "sec")
    assert isinstance(
        resolve_agent_provider(EAgentProvider.CLAUDE_CODE, for_oauth_exchange=True),
        RealClaudeCodeProvider,
    )
