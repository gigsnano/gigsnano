"""PM-reported project health (GIN-337).

A project manager's *judgment* about health — stored entirely separately from the
system-calculated health (GIN-336) so the two can disagree and both stay visible.

Append-only versioning: every submit is a new immutable row, so history is never
edited invisibly — "the latest PM update" is the newest non-retracted row, and the
full revision history is every row for the project. A retract sets `retracted_at`
rather than deleting, keeping the audit trail intact.
"""

import enum
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import JSON_DOC, TimestampedBase, _values


class EPmHealthStatus(str, enum.Enum):
    """PM-reported status. Mirrors the system statuses so the two are comparable;
    there is no NO_DATA — a PM update always carries an explicit judgment."""

    ON_TRACK = "on_track"
    AT_RISK = "at_risk"
    OFF_TRACK = "off_track"


PM_HEALTH_STATUS_ENUM = Enum(EPmHealthStatus, name="pm_health_status", values_callable=_values)


class PmHealthUpdate(TimestampedBase):
    __tablename__ = "pm_health_updates"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    reported_status: Mapped[EPmHealthStatus] = mapped_column(PM_HEALTH_STATUS_ENUM)
    narrative: Mapped[str] = mapped_column(Text)
    key_risks: Mapped[str | None] = mapped_column(Text, default=None)
    next_milestone: Mapped[str | None] = mapped_column(String(300), default=None)
    next_milestone_date: Mapped[date | None] = mapped_column(Date, default=None)
    decision_needed: Mapped[str | None] = mapped_column(Text, default=None)
    recovery_owner_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    next_review_date: Mapped[date | None] = mapped_column(Date, default=None)
    # Canonical work-item / dependency references (ids or links); kept as a JSON list
    # so the frontend content model can attach mentions without a schema change.
    # (Column name avoids the SQL reserved word "references".)
    work_item_refs: Mapped[list | None] = mapped_column(JSON_DOC, default=None)
    # Author is retained even if the user is later removed (audit): id may go null,
    # name is denormalized so the history stays readable.
    author_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    author_name: Mapped[str] = mapped_column(String(120))
    # Soft retract — keeps the version in history rather than editing it away.
    retracted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )
