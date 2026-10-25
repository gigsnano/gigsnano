"""Agentic workflow gates (GIN-220): per-project rules that gate a Story status
transition on an approver — a human role OR an AI persona that reviews the work
and returns PASS / CONCERNS / FAIL. Generalizes the implementation-readiness
verdict (reuses EReadinessResult) into an enforced transition gate; every
decision is recorded (GateDecision) for audit.

ponytail: status/verdict/kind columns are String (not native enums) — the
EStoryStatus/readiness_result PG enum types already exist and can't be reused in
a new CREATE TABLE without create_type juggling; the Python enums below validate.
"""

import enum

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import TimestampedBase


class EApproverKind(str, enum.Enum):
    HUMAN = "human"      # a workspace role must perform the transition
    PERSONA = "persona"  # a BMAD persona reviews and returns a verdict


class EGateConcernPolicy(str, enum.Enum):
    BLOCK = "block"  # CONCERNS blocks (default — conservative)
    WARN = "warn"    # CONCERNS allows but records the concern
    ALLOW = "allow"  # CONCERNS is treated as a pass


class WorkflowRule(TimestampedBase):
    __tablename__ = "workflow_rules"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    from_status: Mapped[str] = mapped_column(String(20), default="")   # "" = any source state
    to_status: Mapped[str] = mapped_column(String(20))                 # EStoryStatus value
    approver_kind: Mapped[str] = mapped_column(String(10))             # EApproverKind value
    approver_ref: Mapped[str] = mapped_column(String(40))             # role name | BMAD agent id
    on_concerns: Mapped[str] = mapped_column(String(10), default=EGateConcernPolicy.BLOCK.value)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class GateDecision(TimestampedBase):
    """Durable, queryable audit of one gate evaluation (structured — the story
    activity feed is too loose for verdict/rationale/approver)."""

    __tablename__ = "gate_decisions"

    story_id: Mapped[str] = mapped_column(
        ForeignKey("stories.id", ondelete="CASCADE"), index=True
    )
    rule_id: Mapped[str | None] = mapped_column(
        ForeignKey("workflow_rules.id", ondelete="SET NULL"), default=None
    )
    from_status: Mapped[str] = mapped_column(String(20))
    to_status: Mapped[str] = mapped_column(String(20))
    approver_kind: Mapped[str] = mapped_column(String(10))
    approver_ref: Mapped[str] = mapped_column(String(40))
    verdict: Mapped[str] = mapped_column(String(10))                   # EReadinessResult value
    allowed: Mapped[bool] = mapped_column(Boolean)
    rationale: Mapped[str] = mapped_column(Text, default="")
    actor_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
