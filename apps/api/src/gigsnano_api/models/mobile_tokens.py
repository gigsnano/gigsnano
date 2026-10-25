"""Refresh tokens issued to the mobile app.

Opaque and stored hashed. Each sign-in starts a family; every refresh revokes the
presented token and issues the next one in the same family. Presenting a revoked
token means it was copied, so the whole family is revoked.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import TimestampedBase


class MobileRefreshToken(TimestampedBase):
    __tablename__ = "mobile_refresh_tokens"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    family_id: Mapped[str] = mapped_column(String(36), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    device_name: Mapped[str] = mapped_column(String(120), default="")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
