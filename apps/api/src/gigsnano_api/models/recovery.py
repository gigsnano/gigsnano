"""Project recovery plans (GIN-385).

A recovery plan is a *reviewable change set*, not a document. The distinction is
the whole point: a plan written as Markdown gets read once and rots, while a plan
made of rows can be approved change-by-change, applied, and undone.

Each change records what it would do, what the value is now, why, how confident
the proposer is, and — once applied — what actually happened. The `previous_value`
captured at apply time is what makes rollback real rather than aspirational.
"""

import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import TimestampedBase, _values


class EPlanStatus(str, enum.Enum):
    DRAFT = "draft"  # proposed, nothing decided
    APPROVED = "approved"  # at least one change approved, not yet applied
    APPLIED = "applied"
    REJECTED = "rejected"
    ROLLED_BACK = "rolled_back"


class EChangeStatus(str, enum.Enum):
    PROPOSED = "proposed"
    APPROVED = "approved"
    REJECTED = "rejected"
    APPLIED = "applied"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"


PLAN_STATUS_ENUM = Enum(EPlanStatus, name="recovery_plan_status", values_callable=_values)
CHANGE_STATUS_ENUM = Enum(EChangeStatus, name="recovery_change_status", values_callable=_values)


class RecoveryPlan(TimestampedBase):
    __tablename__ = "recovery_plans"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(300))
    summary: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[EPlanStatus] = mapped_column(
        PLAN_STATUS_ENUM, default=EPlanStatus.DRAFT, index=True
    )
    created_by_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    created_by_name: Mapped[str] = mapped_column(String(120), default="")
    #: Shared by every change the plan applies, and with the director action that
    #: authorized it (GIN-387).
    correlation_id: Mapped[str] = mapped_column(String(64), default="")
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    applied_by_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )


class RecoveryPlanChange(TimestampedBase):
    """One proposed edit. Deliberately narrow — a work-item field change — because
    that is what a recovery plan actually consists of, and it reuses the same
    validation as every other work-item write."""

    __tablename__ = "recovery_plan_changes"

    plan_id: Mapped[str] = mapped_column(
        ForeignKey("recovery_plans.id", ondelete="CASCADE"), index=True
    )
    #: The work item, by code — stable and readable in an approval UI.
    code: Mapped[str] = mapped_column(String(40))
    field: Mapped[str] = mapped_column(String(40))
    #: Rendered values, so an approver reads "todo -> in_progress", not ids.
    current_value: Mapped[str | None] = mapped_column(String(300), default=None)
    proposed_value: Mapped[str | None] = mapped_column(String(300), default=None)

    reason: Mapped[str] = mapped_column(Text, default="")
    evidence: Mapped[str] = mapped_column(Text, default="")
    confidence: Mapped[float] = mapped_column(Float, default=0.5)
    status: Mapped[EChangeStatus] = mapped_column(
        CHANGE_STATUS_ENUM, default=EChangeStatus.PROPOSED, index=True
    )
    #: What the field actually held the moment before the change landed. Captured
    #: at apply time, not at proposal time — the row may have moved since.
    previous_value: Mapped[str | None] = mapped_column(String(300), default=None)
    error: Mapped[str] = mapped_column(Text, default="")
    decided_by_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
