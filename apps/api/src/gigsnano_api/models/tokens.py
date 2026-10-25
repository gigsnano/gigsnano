"""Personal access tokens: opaque bearer tokens for programmatic API access.

Only the SHA-256 hash of a token is ever persisted; the plaintext is shown to
the user once (at creation) and never stored or logged.
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import TimestampedBase

TOKEN_PREFIX = "gnp_"  # nosec B105 - public prefix; the secret is the generated remainder


def generate_token() -> tuple[str, str]:
    """Generate a new opaque token. Returns (plaintext, sha256_hex).

    Only the hash should ever be persisted; the plaintext is returned once
    for display to the user.
    """
    plaintext = TOKEN_PREFIX + secrets.token_urlsafe(32)
    return plaintext, hash_token(plaintext)


def hash_token(plaintext: str) -> str:
    return hashlib.sha256(plaintext.encode()).hexdigest()


class PersonalAccessToken(TimestampedBase):
    __tablename__ = "personal_access_tokens"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
