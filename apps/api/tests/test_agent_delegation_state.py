import pytest

from gigsnano_api.agent_delegation.state import sign_agent_state, verify_agent_state


def test_roundtrip():
    token = sign_agent_state("u_1", "cursor")
    assert verify_agent_state(token) == ("u_1", "cursor", None)


def test_roundtrip_with_pkce():
    token = sign_agent_state("u_1", "codex", pkce_verifier="verifier123")
    assert verify_agent_state(token) == ("u_1", "codex", "verifier123")


def test_tampered_signature_rejected():
    token = sign_agent_state("u_1", "cursor")
    raw, _sig = token.split(".", 1)
    with pytest.raises(ValueError):
        verify_agent_state(f"{raw}.deadbeef")
