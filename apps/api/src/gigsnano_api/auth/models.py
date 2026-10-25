from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.core.db import TimestampedBase


class User(TimestampedBase):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str | None] = mapped_column(String(255), default=None)
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, default=None)
    apple_sub: Mapped[str | None] = mapped_column(
        String(255), unique=True, index=True, default=None
    )
    avatar_url: Mapped[str | None] = mapped_column(String(500), default=None)
    last_workspace_slug: Mapped[str | None] = mapped_column(String(100), default=None)
    # Explicitly-chosen workspace for the hosted MCP (set via the set_active_workspace
    # tool, like `az account set`). Kept separate from last_workspace_slug so app
    # navigation never silently changes the MCP's active context.
    mcp_active_workspace_slug: Mapped[str | None] = mapped_column(String(100), default=None)
    email_digest: Mapped[bool] = mapped_column(Boolean, default=True)
    # Real-time mobile pushes; the morning-briefing push is a digest channel instead.
    push_realtime: Mapped[bool] = mapped_column(Boolean, default=True, server_default=sa.true())
    product_updates: Mapped[bool] = mapped_column(Boolean, default=True)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    is_suspended: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    suspended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
