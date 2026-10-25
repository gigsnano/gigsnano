import jwt
import pytest

from gigsnano_api.core.config import settings
from gigsnano_api.core.security import (
    create_token,
    decode_token,
    hash_password,
    verify_password,
)


def test_password_hash_roundtrip():
    hashed = hash_password("s3cret!")
    assert hashed != "s3cret!"
    assert verify_password("s3cret!", hashed) is True
    assert verify_password("wrong", hashed) is False


def test_token_roundtrip():
    token = create_token("user-123", "access")
    assert decode_token(token, "access") == "user-123"


def test_token_wrong_type_rejected():
    token = create_token("user-123", "refresh")
    with pytest.raises(jwt.InvalidTokenError):
        decode_token(token, "access")


def test_expired_token_rejected(monkeypatch):
    monkeypatch.setattr(settings, "access_token_ttl_minutes", -1)
    token = create_token("user-123", "access")
    with pytest.raises(jwt.InvalidTokenError):
        decode_token(token, "access")
