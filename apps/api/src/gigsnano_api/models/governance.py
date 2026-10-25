"""Risks, decisions and escalations (GIN-386).

The three things a project manager tracks that are not work items. They were
previously carried in prose — a status update, a Slack thread, a doc — which is
why they went stale silently: prose cannot be queried, counted or chased.

Each is a record with an owner and a due date, because that is what makes one
actionable rather than decorative.
"""

import enum
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import JSON_DOC, TimestampedBase, _values


class ERiskStatus(str, enum.Enum):
    OPEN = "open"
    MITIGATING = "mitigating"
    CLOSED = "closed"
    OCCURRED = "occurred"  # it stopped being a risk and became a fact


class ERiskCategory(str, enum.Enum):
    DELIVERY = "delivery"
    TECHNICAL = "technical"
    RESOURCE = "resource"
    EXTERNAL = "external"
    SECURITY = "security"
    COMPLIANCE = "compliance"
    BUDGET = "budget"
    SCOPE = "scope"


class EDecisionStatus(str, enum.Enum):
    OPEN = "open"
    RESOLVED = "resolved"
    DEFERRED = "deferred"


class EEscalationStatus(str, enum.Enum):
    OPEN = "open"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"


class EEscalationCategory(str, enum.Enum):
    ACCESS = "access"
    VENDOR = "vendor"
    APPROVAL = "approval"
    SECURITY = "security"
    BUDGET = "budget"
    SCOPE = "scope"
    STAFFING = "staffing"
    EXTERNAL_DEPENDENCY = "external_dependency"


RISK_STATUS_ENUM = Enum(ERiskStatus, name="risk_status", values_callable=_values)
RISK_CATEGORY_ENUM = Enum(ERiskCategory, name="risk_category", values_callable=_values)
DECISION_STATUS_ENUM = Enum(EDecisionStatus, name="decision_status", values_callable=_values)
ESCALATION_STATUS_ENUM = Enum(
    EEscalationStatus, name="escalation_status", values_callable=_values
)
ESCALATION_CATEGORY_ENUM = Enum(
    EEscalationCategory, name="escalation_category", values_callable=_values
)


class ProjectRisk(TimestampedBase):
    """Probability × impact, with a mitigation and a trigger. Exposure is stored,
    not derived on read, so a report of last month's exposure means what it said
    at the time."""

    __tablename__ = "project_risks"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[ERiskCategory] = mapped_column(
        RISK_CATEGORY_ENUM, default=ERiskCategory.DELIVERY
    )
    status: Mapped[ERiskStatus] = mapped_column(
        RISK_STATUS_ENUM, default=ERiskStatus.OPEN, index=True
    )
    probability: Mapped[int] = mapped_column(Integer, default=3)  # 1-5
    impact: Mapped[int] = mapped_column(Integer, default=3)  # 1-5
    exposure: Mapped[int] = mapped_column(Integer, default=9)  # probability × impact

    owner_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    mitigation: Mapped[str] = mapped_column(Text, default="")
    contingency: Mapped[str] = mapped_column(Text, default="")
    #: The observable signal that this risk is materializing.
    trigger: Mapped[str] = mapped_column(Text, default="")
    due_date: Mapped[date | None] = mapped_column(Date, default=None)

    #: Work-item codes and milestone ids this risk threatens.
    affected_work_item_codes: Mapped[list | None] = mapped_column(JSON_DOC, default=None)
    affected_milestone_ids: Mapped[list | None] = mapped_column(JSON_DOC, default=None)

    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    closed_by_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    closure_note: Mapped[str] = mapped_column(Text, default="")


class ProjectDecision(TimestampedBase):
    """A question someone has to answer, with what it costs to keep not answering
    it. `impact_of_delay` is the field that gets decisions made."""

    __tablename__ = "project_decisions"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    question: Mapped[str] = mapped_column(String(500))
    context: Mapped[str] = mapped_column(Text, default="")
    #: [{"key": "a", "summary": "...", "pros": "...", "cons": "..."}]
    options: Mapped[list | None] = mapped_column(JSON_DOC, default=None)
    recommended_option: Mapped[str | None] = mapped_column(String(120), default=None)
    rationale: Mapped[str] = mapped_column(Text, default="")
    evidence: Mapped[str] = mapped_column(Text, default="")
    impact_of_delay: Mapped[str] = mapped_column(Text, default="")

    status: Mapped[EDecisionStatus] = mapped_column(
        DECISION_STATUS_ENUM, default=EDecisionStatus.OPEN, index=True
    )
    owner_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    due_date: Mapped[date | None] = mapped_column(Date, default=None)

    selected_option: Mapped[str | None] = mapped_column(String(120), default=None)
    decided_by_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    decided_by_name: Mapped[str | None] = mapped_column(String(120), default=None)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    decision_note: Mapped[str] = mapped_column(Text, default="")


class ProjectEscalation(TimestampedBase):
    """Something the team cannot resolve at its own level, raised to someone who
    can. Distinct from a blocker: a blocker stops one work item, an escalation
    asks a named person outside the team to act."""

    __tablename__ = "project_escalations"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[EEscalationCategory] = mapped_column(ESCALATION_CATEGORY_ENUM)
    status: Mapped[EEscalationStatus] = mapped_column(
        ESCALATION_STATUS_ENUM, default=EEscalationStatus.OPEN, index=True
    )
    #: Who is being asked to act — free text, because it is often someone with no
    #: account here (a client sponsor, a vendor contact).
    raised_to: Mapped[str] = mapped_column(String(200), default="")
    raised_by_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    raised_by_name: Mapped[str] = mapped_column(String(120), default="")
    needed_by: Mapped[date | None] = mapped_column(Date, default=None)

    acknowledged_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    resolution: Mapped[str] = mapped_column(Text, default="")
    #: The blocker this escalation exists to clear, when there is one.
    blocker_id: Mapped[str | None] = mapped_column(
        ForeignKey("work_item_blockers.id", ondelete="SET NULL"), default=None
    )
