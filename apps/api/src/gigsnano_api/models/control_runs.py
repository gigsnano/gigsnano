"""Project control runs (GIN-388).

One row per daily pass of the project director: what it looked at, what it found,
what it did, what it wants a human to decide, and what the forecast said before
and after. Persisted because "the director checked yesterday" is only useful if
you can read what it saw.

The run is deterministic analysis over records that already exist (readiness,
blockers, decisions, escalations, forecast) — no model is called, and the columns
that would record one stay null rather than implying a judgement nobody made.
"""

import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import JSON_DOC, TimestampedBase, _values


class EControlRunStatus(str, enum.Enum):
    COMPLETED = "completed"
    FAILED = "failed"


CONTROL_RUN_STATUS_ENUM = Enum(
    EControlRunStatus, name="control_run_status", values_callable=_values
)


class ProjectControlRun(TimestampedBase):
    __tablename__ = "project_control_runs"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[EControlRunStatus] = mapped_column(
        CONTROL_RUN_STATUS_ENUM, default=EControlRunStatus.COMPLETED
    )
    #: The window this run considered — everything changed since the previous run.
    window_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    window_to: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    #: What it saw: readiness tallies, blockers, overdue decisions/escalations,
    #: stale work — each finding names its evidence rather than asserting a mood.
    findings: Mapped[dict | None] = mapped_column(JSON_DOC, default=None)
    #: Actions it would take, and the policy verdict for each (GIN-387).
    actions_proposed: Mapped[list | None] = mapped_column(JSON_DOC, default=None)
    actions_executed: Mapped[list | None] = mapped_column(JSON_DOC, default=None)
    actions_awaiting_approval: Mapped[list | None] = mapped_column(JSON_DOC, default=None)
    actions_failed: Mapped[list | None] = mapped_column(JSON_DOC, default=None)

    forecast_before: Mapped[dict | None] = mapped_column(JSON_DOC, default=None)
    forecast_after: Mapped[dict | None] = mapped_column(JSON_DOC, default=None)

    #: Null while the run is pure analysis. A run that never called a model must
    #: not look like one that did.
    model: Mapped[str | None] = mapped_column(String(80), default=None)
    input_tokens: Mapped[int | None] = mapped_column(Integer, default=None)
    output_tokens: Mapped[int | None] = mapped_column(Integer, default=None)

    correlation_id: Mapped[str] = mapped_column(String(64), default="")
    triggered_by_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    error: Mapped[str | None] = mapped_column(String(500), default=None)
