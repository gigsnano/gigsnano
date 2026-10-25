"""Solution setup drafts (GIN-443/445/446).

Persists in-progress solution setup before a project exists. Drafts expire after
`DRAFT_TTL_DAYS`; `SETUP_DRAFT_STEP` must match the frontend constant.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import JSON_DOC, TimestampedBase

DRAFT_TTL_DAYS = 30
SETUP_DRAFT_STEP = "setup"  # must match frontend SETUP_DRAFT_STEP


class SetupDraft(TimestampedBase):
    __tablename__ = "setup_drafts"

    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    created_by_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    solution_key: Mapped[str] = mapped_column(String(64))
    solution_version: Mapped[int] = mapped_column(Integer)
    starting_point: Mapped[str | None] = mapped_column(String(64), default=None)
    step: Mapped[str] = mapped_column(String(64), default=SETUP_DRAFT_STEP)
    values: Mapped[dict] = mapped_column(JSON_DOC, default=dict)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
