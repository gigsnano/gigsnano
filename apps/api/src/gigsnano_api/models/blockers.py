"""Work-item blockers (GIN-383).

A blocking *relation* says one item waits on another. A blocker says *why* work is
stopped, who owns getting it moving, when it is expected to clear and what it
costs — including the common case a relation cannot express at all: an external
dependency (a vendor, an access request, a decision) that is not a work item.

Blocked work must read as distinct from ordinary Todo. "Nobody has started it" and
"nobody can start it" are different problems, and a board that renders them the
same hides the second one.
"""

import enum
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import TimestampedBase, _values


class EBlockerStatus(str, enum.Enum):
    OPEN = "open"
    RESOLVED = "resolved"
    CANCELLED = "cancelled"  # it turned out not to be blocking after all


class EBlockerImpact(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class EEscalationLevel(str, enum.Enum):
    NONE = "none"
    TEAM = "team"
    PROJECT = "project"
    SPONSOR = "sponsor"
    EXTERNAL = "external"


BLOCKER_STATUS_ENUM = Enum(EBlockerStatus, name="blocker_status", values_callable=_values)
BLOCKER_IMPACT_ENUM = Enum(EBlockerImpact, name="blocker_impact", values_callable=_values)
ESCALATION_LEVEL_ENUM = Enum(EEscalationLevel, name="blocker_escalation", values_callable=_values)


class WorkItemBlocker(TimestampedBase):
    __tablename__ = "work_item_blockers"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    #: The item that cannot proceed.
    story_id: Mapped[str] = mapped_column(
        ForeignKey("stories.id", ondelete="CASCADE"), index=True
    )
    #: The blocking work item, when it is one. Null for an external dependency —
    #: which is most of the interesting ones.
    blocking_story_id: Mapped[str | None] = mapped_column(
        ForeignKey("stories.id", ondelete="SET NULL"), default=None
    )
    #: What is blocking it when no work item can express it: "Azure tenant access",
    #: "vendor contract signature".
    external_dependency: Mapped[str] = mapped_column(String(300), default="")

    reason: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[EBlockerStatus] = mapped_column(
        BLOCKER_STATUS_ENUM, default=EBlockerStatus.OPEN, index=True
    )
    impact: Mapped[EBlockerImpact] = mapped_column(
        BLOCKER_IMPACT_ENUM, default=EBlockerImpact.MEDIUM
    )
    escalation_level: Mapped[EEscalationLevel] = mapped_column(
        ESCALATION_LEVEL_ENUM, default=EEscalationLevel.NONE
    )

    #: Who is getting it unblocked — not who is blocked by it.
    owner_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    raised_by_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    raised_by_name: Mapped[str] = mapped_column(String(120), default="")
    expected_resolution_date: Mapped[date | None] = mapped_column(Date, default=None)

    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    resolved_by_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    #: How we know it is actually clear — a PR, a ticket, an approval, a link.
    resolution_evidence: Mapped[str] = mapped_column(Text, default="")
