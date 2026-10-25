import pytest

from gigsnano_api.sync.github_state import sign_state, verify_state


def test_roundtrip():
    token = sign_state("acme", "u_1")
    assert verify_state(token) == ("acme", "u_1")

def test_tampered_rejected():
    with pytest.raises(ValueError):
        verify_state(sign_state("acme", "u_1") + "x")
