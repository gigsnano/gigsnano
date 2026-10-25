"""Shared Fernet token-at-rest encryption (GIN-23 DRY extraction from
`github_oauth.py` so Slack reuses the same helper instead of duplicating it).

Keyless dev (no TOKEN_ENCRYPTION_KEY) stores tokens as-is; production encrypts.
"""

from gigsnano_api.core.config import settings


def _fernet():
    from cryptography.fernet import Fernet

    return Fernet(settings.token_encryption_key.encode())


def encrypt_token(token: str) -> str:
    if not settings.token_encryption_key:
        return token
    return _fernet().encrypt(token.encode()).decode()


def decrypt_token(ciphertext: str) -> str:
    if not settings.token_encryption_key:
        return ciphertext
    from cryptography.fernet import InvalidToken

    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken as err:
        # Ciphertext was written under a different TOKEN_ENCRYPTION_KEY (key rotated,
        # or token stored while keyless then a key was added). Fernet's InvalidToken
        # stringifies to '' — which surfaced to users as a bare "InvalidToken" clone
        # error (GIN-12). Give an actionable message; the only fix is to reconnect.
        raise RuntimeError(
            "Stored access token could not be decrypted (server encryption key "
            "changed). Reconnect the integration to store a fresh token."
        ) from err
