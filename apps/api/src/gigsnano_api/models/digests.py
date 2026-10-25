import enum
from datetime import date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import TimestampedBase, _values


class EDigestStatus(str, enum.Enum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"
    SKIPPED = "skipped"  # nothing pending for the user that day


DIGEST_STATUS_ENUM = Enum(EDigestStatus, name="digest_status", values_callable=_values)


class DigestDelivery(TimestampedBase):
    """One daily-digest delivery attempt for one user in one workspace (GIN-103).

    The `(user_id, workspace_id, run_date)` uniqueness makes the run idempotent —
    a re-run (scheduler restart, retry, manual trigger) never double-sends. Also
    the delivery log + open/click metrics the epic asks for.
    """

    __tablename__ = "digest_deliveries"
    __table_args__ = (UniqueConstraint("user_id", "workspace_id", "run_date"),)

    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    run_date: Mapped[date] = mapped_column(Date, index=True)
    status: Mapped[EDigestStatus] = mapped_column(
        DIGEST_STATUS_ENUM, default=EDigestStatus.PENDING
    )
    # Channels the digest went out on, e.g. ["email", "in_app"].
    channels: Mapped[list] = mapped_column(JSON, default=list)
    item_count: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text, default=None)
    # Engagement metrics (email open pixel + tracked click).
    opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    clicked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    subject: Mapped[str] = mapped_column(String(300), default="")
    # What actually went out. A digest is a point-in-time snapshot — the stories
    # move on the next day, so "what did we send Arun on the 14th?" cannot be
    # recomputed from the stories later; if it isn't kept here it's gone.
    #
    # Kept in the table rather than the log deliberately. Logs are unstructured,
    # get shipped to aggregators, and rotate away — a bad place for the contents
    # of someone's mail. This row is already the record of what we sent to whom.
    ai_summary: Mapped[str | None] = mapped_column(Text, default=None)
    # Null when email wasn't one of the channels — there was no email content.
    body_html: Mapped[str | None] = mapped_column(Text, default=None)


class EDigestTemplate(str, enum.Enum):
    """Role-based digest layout (GIN-102). Reshapes the same pending-work buckets
    by persona emphasis (ordering + labels); it does not compute new analytics."""

    DEFAULT = "default"
    MANAGER = "manager"  # cycle health first (overdue/at-risk)
    DEVELOPER = "developer"  # blockers first (in-review/overdue)
    PM = "pm"  # upcoming milestones first (due-soon)


# 0=Mon … 6=Sun, matching Python's date.weekday().
ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6]

# Delivery defaults. These are the ONE source for both "user has no preference
# row" (service._DEFAULT_*) and "row just created without explicit values" (the
# column defaults below). If those two disagree, saving any unrelated setting
# silently moves your delivery time.
#
# 09:00 Asia/Kolkata (03:30 UTC), not 09:00 UTC: "9am" has to mean 9am where the
# team is, and UTC would land at 14:30 local. Per-user zones override it — the
# settings form detects and saves the real browser zone (GIN-127).
DEFAULT_TIMEZONE = "Asia/Kolkata"
DEFAULT_HOUR = 9


class DigestPreference(TimestampedBase):
    """Per-user digest settings (GIN-100, timing in GIN-124). One row per user;
    absence = defaults (enabled, every day at 08:00 UTC, todo+in_progress,
    email+in_app)."""

    __tablename__ = "digest_preferences"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True
    )
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    # Delivery timing (GIN-124). `digest_weekdays` is the ONE source of truth for
    # which days run — daily is all seven, weekly is one. It replaced the old
    # frequency/weekly_day pair, which encoded the same fact twice and could
    # disagree (frequency=DAILY + weekly_day=2 was legal and meaningless).
    timezone: Mapped[str] = mapped_column(String(64), default=DEFAULT_TIMEZONE)  # IANA
    digest_hour: Mapped[int] = mapped_column(Integer, default=DEFAULT_HOUR)  # 0-23, local to `timezone`
    digest_weekdays: Mapped[list] = mapped_column(JSON, default=lambda: list(ALL_WEEKDAYS))
    # Role-based layout (GIN-102). Plain string (validated app-side) to avoid an
    # enum-alter migration; "default" = the classic due-date ordering.
    template: Mapped[str] = mapped_column(String(20), default="default")
    # Story statuses to include, e.g. ["todo", "in_progress"].
    statuses: Mapped[list] = mapped_column(JSON, default=lambda: ["todo", "in_progress"])
    # Delivery channels, e.g. ["email", "in_app"]. "slack" is stored but not yet wired.
    channels: Mapped[list] = mapped_column(JSON, default=lambda: ["email", "in_app"])
