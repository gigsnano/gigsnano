import time
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from gigsnano_api.auth import apple
from gigsnano_api.core.config import settings

_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture(autouse=True)
def _apple(monkeypatch):
    monkeypatch.setattr(settings, "apple_bundle_id", "com.gigsnano.app")
    monkeypatch.setattr(
        apple,
        "_jwks_client",
        SimpleNamespace(get_signing_key_from_jwt=lambda _t: SimpleNamespace(key=_KEY.public_key())),
    )


def _token(**claims) -> str:
    now = int(time.time())
    payload = {
        "iss": "https://appleid.apple.com",
        "aud": "com.gigsnano.app",
        "sub": "apple-sub-1",
        "email": "ada@example.test",
        "email_verified": "true",
        "iat": now,
        "exp": now + 600,
    } | claims
    return jwt.encode(payload, _KEY, algorithm="RS256", headers={"kid": "k1"})


def test_valid_token_returns_identity():
    identity = apple.verify_apple_identity_token(_token())
    assert identity == apple.AppleIdentity(
        sub="apple-sub-1", email="ada@example.test", email_verified=True
    )


def test_wrong_audience_rejected():
    with pytest.raises(apple.AppleTokenError):
        apple.verify_apple_identity_token(_token(aud="com.other.app"))


def test_wrong_issuer_rejected():
    with pytest.raises(apple.AppleTokenError):
        apple.verify_apple_identity_token(_token(iss="https://evil.example"))


def test_expired_rejected():
    with pytest.raises(apple.AppleTokenError):
        apple.verify_apple_identity_token(_token(exp=int(time.time()) - 10))


def test_hidden_email_relay_without_verification():
    identity = apple.verify_apple_identity_token(_token(email=None, email_verified=False))
    assert identity.email is None and identity.email_verified is False


def test_not_configured(monkeypatch):
    monkeypatch.setattr(settings, "apple_bundle_id", "")
    with pytest.raises(RuntimeError):
        apple.verify_apple_identity_token(_token())


def _without(claim: str) -> str:
    now = int(time.time())
    payload = {
        "iss": "https://appleid.apple.com",
        "aud": "com.gigsnano.app",
        "sub": "apple-sub-1",
        "iat": now,
        "exp": now + 600,
    }
    del payload[claim]
    return jwt.encode(payload, _KEY, algorithm="RS256", headers={"kid": "k1"})


@pytest.mark.parametrize("claim", ["sub", "exp"])
def test_missing_required_claim_rejected(claim):
    with pytest.raises(apple.AppleTokenError):
        apple.verify_apple_identity_token(_without(claim))
