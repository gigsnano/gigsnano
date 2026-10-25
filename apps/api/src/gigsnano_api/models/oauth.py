"""OAuth 2.1 models for MCP hosted auth (clients, authorization codes, refresh tokens)."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import TimestampedBase


class OAuthClient(TimestampedBase):
    __tablename__ = "oauth_clients"

    client_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    client_name: Mapped[str] = mapped_column(String(120))
    redirect_uris: Mapped[list[str]] = mapped_column(JSON, default=list)


class OAuthAuthorizationCode(TimestampedBase):
    __tablename__ = "oauth_authorization_codes"

    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    client_id: Mapped[str] = mapped_column(String(64), index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"))
    redirect_uri: Mapped[str] = mapped_column(String(512))
    code_challenge: Mapped[str] = mapped_column(String(128))
    scope: Mapped[str] = mapped_column(String(64), default="mcp")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used: Mapped[bool] = mapped_column(Boolean, default=False)


class OAuthRefreshToken(TimestampedBase):
    __tablename__ = "oauth_refresh_tokens"

    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    client_id: Mapped[str] = mapped_column(String(64), index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"))
    scope: Mapped[str] = mapped_column(String(64), default="mcp")
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
