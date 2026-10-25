import base64
import hashlib

import pytest

from gigsnano_api.auth.handoff import (
    hash_code,
    is_allowed_handoff_redirect,
    is_valid_challenge,
    is_valid_verifier,
    pkce_s256,
)


def test_pkce_s256_has_no_padding():
    out = pkce_s256("a" * 43)
    expected = base64.urlsafe_b64encode(hashlib.sha256(b"a" * 43).digest()).decode()
    assert out == expected.rstrip("=")
    assert "=" not in out


def test_hash_code_is_sha256_hex():
    assert hash_code("abc") == hashlib.sha256(b"abc").hexdigest()
    assert len(hash_code("abc")) == 64


@pytest.mark.parametrize(
    "uri",
    [
        "gigsnano://auth",
        "exp://192.168.1.2:8081/--/auth",
        "exp://10.0.2.2:8081/--/auth",
        "exp://172.16.0.5:8081/--/auth",
        "exp://172.31.255.255/--/auth",
        "exp://127.0.0.1:8081/--/auth",
        "exp://localhost:8081/--/auth",
    ],
)
def test_allowed_redirects(uri):
    assert is_allowed_handoff_redirect(uri, allow_expo_go=True)


@pytest.mark.parametrize(
    "uri",
    [
        "https://evil.example/auth",
        "exp://8.8.8.8:8081/--/auth",
        "exp://evil.example/--/auth",
        "gigsnano://other",
        "gigsnano://auth/",
        "gigsnano://auth?x=1",
        "exp://172.32.0.1:8081/--/auth",
        "exp://172.15.0.1:8081/--/auth",
        "exp://192.168.1.2:8081/--/other",
        "exp://192.168.1.2:8081/--/auth?x=1",
        "exp://192.168.1.2:8081/--/auth#f",
        "exp://user@192.168.1.2:8081/--/auth",
        "exp://192.168.1.2:99999/--/auth",
        "exp://192.168.1.2:abc/--/auth",
        "exp://localhost.evil.example/--/auth",
        "exp://192.168.1.2.evil.example/--/auth",
        "exp://[::1]:8081/--/auth",
        "exp://0x7f000001/--/auth",
        "exp://192.168.01.2/--/auth",
        "",
    ],
)
def test_disallowed_redirects(uri):
    assert not is_allowed_handoff_redirect(uri, allow_expo_go=True)


def test_expo_go_flag_off_rejects_exp():
    assert not is_allowed_handoff_redirect("exp://192.168.1.2:8081/--/auth", allow_expo_go=False)
    assert is_allowed_handoff_redirect("gigsnano://auth", allow_expo_go=False)


def test_pkce_s256_non_ascii_does_not_raise():
    assert len(pkce_s256("\u00e9" * 43)) == 43


def test_valid_challenge():
    assert is_valid_challenge(pkce_s256("a" * 43), "S256")
    assert is_valid_challenge("A" * 128, "S256")


@pytest.mark.parametrize(
    ("challenge", "method"),
    [
        ("a" * 43, "plain"),
        ("a" * 42, "S256"),
        ("a" * 129, "S256"),
        ("a" * 42 + "=", "S256"),
        ("a" * 42 + "+", "S256"),
        ("a" * 42 + "/", "S256"),
    ],
)
def test_invalid_challenge(challenge, method):
    assert not is_valid_challenge(challenge, method)


@pytest.mark.parametrize("verifier", ["a" * 43, "Z" * 128, "aB0-_" * 9])
def test_valid_verifier(verifier):
    assert is_valid_verifier(verifier)


@pytest.mark.parametrize("verifier", ["", "a" * 10, "a" * 42, "a" * 129, "a" * 42 + "=", "a" * 42 + "~"])
def test_invalid_verifier(verifier):
    assert not is_valid_verifier(verifier)
