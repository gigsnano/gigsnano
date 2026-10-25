from datetime import datetime, timedelta, timezone
from typing import Literal

import jwt
from pwdlib import PasswordHash

from gigsnano_api.core.config import settings

_hasher = PasswordHash.recommended()  # argon2

TokenType = Literal["access", "refresh"]


def hash_password(plain: str) -> str:
    return _hasher.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _hasher.verify(plain, hashed)


def create_token(user_id: str, token_type: TokenType) -> str:
    ttl = (
        timedelta(minutes=settings.access_token_ttl_minutes)
        if token_type == "access"  # nosec B105 - token *type* discriminator, not a secret
        else timedelta(days=settings.refresh_token_ttl_days)
    )
    payload = {
        "sub": user_id,
        "type": token_type,
        "exp": datetime.now(timezone.utc) + ttl,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str, expected_type: TokenType) -> str:
    """Return the token's user id. Raises jwt.InvalidTokenError (incl. expiry)."""
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    if payload.get("type") != expected_type:
        raise jwt.InvalidTokenError(f"expected a {expected_type} token")
    return payload["sub"]


def create_mcp_token(
    user_id: str, client_id: str, scope: str = "mcp", ttl_minutes: int | None = None
) -> str:
    ttl = ttl_minutes if ttl_minutes is not None else settings.mcp_token_ttl_minutes
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "aud": "mcp",
        "client_id": client_id,
        "scope": scope,
        "type": "mcp",
        "iat": now,
        "exp": now + timedelta(minutes=ttl),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_mcp_token(token: str) -> dict:
    return jwt.decode(
        token,
        settings.jwt_secret,
        algorithms=[settings.jwt_algorithm],
        audience="mcp",
    )
