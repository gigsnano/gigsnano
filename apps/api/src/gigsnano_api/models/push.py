"""Mobile push: registered Expo device tokens and the outbox a worker drains.

`notify()` and the morning digest add `PushOutbox` rows inside the caller's own
transaction; a background worker sends them, so no call site needs a sender.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import JSON_DOC, TimestampedBase


class DeviceToken(TimestampedBase):
    __tablename__ = "device_tokens"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    platform: Mapped[str] = mapped_column(String(10))  # "ios" | "android"
    device_name: Mapped[str] = mapped_column(String(120), default="")
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class PushOutbox(TimestampedBase):
    __tablename__ = "push_outbox"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    category: Mapped[str] = mapped_column(String(20))  # "realtime" | "briefing"
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(String(300), default="")
    data: Mapped[dict] = mapped_column(JSON_DOC, default=dict)
    sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None, index=True
    )
    # sent | failed | muted | no_device | expired
    outcome: Mapped[str | None] = mapped_column(String(20), default=None)
