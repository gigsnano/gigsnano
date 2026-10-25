"""GIN-12: a token encrypted under a rotated key must fail with an actionable
message, not a bare Fernet 'InvalidToken'."""

import pytest
from cryptography.fernet import Fernet

from gigsnano_api.core.config import settings
from gigsnano_api.sync.token_crypto import decrypt_token, encrypt_token


def test_roundtrip_with_key(monkeypatch):
    monkeypatch.setattr(settings, "token_encryption_key", Fernet.generate_key().decode())
    assert decrypt_token(encrypt_token("secret-tok")) == "secret-tok"


def test_keyless_is_passthrough(monkeypatch):
    monkeypatch.setattr(settings, "token_encryption_key", "")
    assert decrypt_token(encrypt_token("secret-tok")) == "secret-tok"


def test_rotated_key_raises_actionable_error(monkeypatch):
    monkeypatch.setattr(settings, "token_encryption_key", Fernet.generate_key().decode())
    ciphertext = encrypt_token("secret-tok")
    # Rotate the key: the old ciphertext can no longer be decrypted.
    monkeypatch.setattr(settings, "token_encryption_key", Fernet.generate_key().decode())
    with pytest.raises(RuntimeError, match="Reconnect the integration"):
        decrypt_token(ciphertext)
