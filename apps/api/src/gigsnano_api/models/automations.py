"""Natural-language automations (GIN-221 / 252-254): a plain-language rule is
compiled to an inspectable trigger→conditions→actions AST (no arbitrary code),
dispatched when its trigger fires (a domain event / status transition), and its
actions run through a sandboxed allowlist with a per-run audit + dry-run.

ponytail: the AST lives in a JSON column and action-type is a pydantic Literal
(the schema IS the allowlist) — no per-action native enum. String status columns
follow the workflows.py convention."""

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import TimestampedBase


class AutomationRule(TimestampedBase):
    __tablename__ = "automation_rules"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    source_text: Mapped[str] = mapped_column(Text, default="")   # the original NL request
    trigger_event: Mapped[str] = mapped_column(String(40))       # story.created | story.updated | schedule
    ast: Mapped[dict] = mapped_column(JSON, default=dict)        # {conditions, actions, unsupported}
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    # Recurrence (GIN-240): a schedule-trigger rule carries a cadence + when it next
    # fires; the recurrence scheduler sweeps due rows. Null for event/transition rules.
    schedule: Mapped[dict | None] = mapped_column(JSON, default=None)          # {every: int, unit: minutes|hours|days}
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)


class AutomationRun(TimestampedBase):
    """One audit record per rule firing (matched → executed / dry-run)."""

    __tablename__ = "automation_runs"

    automation_id: Mapped[str | None] = mapped_column(
        ForeignKey("automation_rules.id", ondelete="SET NULL"), default=None
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    trigger_event: Mapped[str] = mapped_column(String(40))
    story_id: Mapped[str | None] = mapped_column(
        ForeignKey("stories.id", ondelete="SET NULL"), default=None
    )
    dry_run: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(20), default="matched")
    actions_taken: Mapped[list] = mapped_column(JSON, default=list)  # [{type, params, result|error}]
