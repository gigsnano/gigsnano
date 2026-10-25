"""Single-use codes that hand a web session to the mobile app (RFC 8252 + PKCE).

Only the SHA-256 of the code is stored; the row is deleted on any exchange attempt.
"""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.core.db import utcnow
from gigsnano_api.models.base import Base

__all__ = ["MobileHandoffCode"]


class MobileHandoffCode(Base):
    __tablename__ = "mobile_handoff_codes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    code_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    code_challenge: Mapped[str] = mapped_column(String(128))
    redirect_uri: Mapped[str] = mapped_column(String(300))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
