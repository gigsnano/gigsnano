"""Usage metering events (GIN-235): one row per metered action (agent run started,
automation executed, ...). Quota checks count rows in the current calendar month —
no running counter, no reset job, no increment race; the window is derived at read.

ponytail: per-event rows. If volume ever hurts, roll up to a
usage_counters(workspace_id, key, period, count) table."""

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import TimestampedBase


class MeteringEvent(TimestampedBase):
    __tablename__ = "metering_events"
    __table_args__ = (
        Index("ix_metering_events_ws_key_created", "workspace_id", "key", "created_at"),
    )

    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE")
    )
    key: Mapped[str] = mapped_column(String(40))
