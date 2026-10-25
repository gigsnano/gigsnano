"""Autonomy policy + the audited action log an AI project director works under
(GIN-387).

Nothing here executes anything. The policy is the boundary: it says which actions
an agent may take by itself, how much it may change in one run, and which actions
always need a named human to approve them. Every autonomous action leaves a row,
approved or not — an action that ran with no record is indistinguishable from one
that never happened.
"""

import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import JSON_DOC, TimestampedBase, _values


class EDirectorAction(str, enum.Enum):
    """What an autonomous director can propose. The restricted ones exist as
    values so a policy can name them even before an executor implements them."""

    # Routine delivery management — allowed by default, within the limits.
    ASSIGN_MODULE = "assign_module"
    ASSIGN_CYCLE = "assign_cycle"
    ASSIGN_OWNER = "assign_owner"
    CHANGE_PRIORITY = "change_priority"
    CHANGE_STATUS = "change_status"
    SHIFT_DATES = "shift_dates"
    CREATE_WORK_ITEM = "create_work_item"
    CREATE_RELATION = "create_relation"
    REPAIR_WORK_ITEM = "repair_work_item"
    # Consequential — approval required by default (see DEFAULT_RESTRICTED).
    REMOVE_COMMITTED_SCOPE = "remove_committed_scope"
    CHANGE_COMMITTED_DEADLINE = "change_committed_deadline"
    CHANGE_BUDGET = "change_budget"
    APPROVE_RELEASE = "approve_release"
    OVERRIDE_GATE = "override_gate"
    RELEASE_PAYMENT = "release_payment"
    CHANGE_EXPERT_ENGAGEMENT = "change_expert_engagement"
    CHANGE_KPI_DEFINITION = "change_kpi_definition"


class EActionStatus(str, enum.Enum):
    PENDING = "pending"  # waiting for a human decision
    APPROVED = "approved"
    REJECTED = "rejected"
    AUTO_APPROVED = "auto_approved"  # within policy, no human needed
    EXECUTED = "executed"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"


DIRECTOR_ACTION_ENUM = Enum(EDirectorAction, name="director_action", values_callable=_values)
ACTION_STATUS_ENUM = Enum(EActionStatus, name="director_action_status", values_callable=_values)

#: Actions that always need a named human, whatever the policy says elsewhere —
#: money, scope, deadlines, releases and gate overrides are not an agent's call.
DEFAULT_RESTRICTED: tuple[str, ...] = (
    EDirectorAction.REMOVE_COMMITTED_SCOPE.value,
    EDirectorAction.CHANGE_COMMITTED_DEADLINE.value,
    EDirectorAction.CHANGE_BUDGET.value,
    EDirectorAction.APPROVE_RELEASE.value,
    EDirectorAction.OVERRIDE_GATE.value,
    EDirectorAction.RELEASE_PAYMENT.value,
    EDirectorAction.CHANGE_EXPERT_ENGAGEMENT.value,
    EDirectorAction.CHANGE_KPI_DEFINITION.value,
)


class ProjectAutonomyPolicy(TimestampedBase):
    """One row per project. Absent = the defaults below, which are deliberately
    conservative: a project that never configured autonomy still gets limits."""

    __tablename__ = "project_autonomy_policies"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), unique=True, index=True
    )

    # Emergency stop. Reads keep working; new autonomous mutations do not.
    paused: Mapped[bool] = mapped_column(Boolean, default=False)
    paused_reason: Mapped[str] = mapped_column(Text, default="")
    paused_by_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    paused_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    # Blast-radius limits for one control run.
    max_items_per_run: Mapped[int] = mapped_column(Integer, default=25)
    max_date_shift_days: Mapped[int] = mapped_column(Integer, default=7)
    max_priority_changes: Mapped[int] = mapped_column(Integer, default=10)
    max_reassignments: Mapped[int] = mapped_column(Integer, default=5)

    #: Allowed "from->to" status moves, or null for "any". A conservative project
    #: can let an agent start work but never close it.
    allowed_status_transitions: Mapped[list | None] = mapped_column(JSON_DOC, default=None)
    #: Actions requiring human approval; defaults to DEFAULT_RESTRICTED.
    restricted_actions: Mapped[list | None] = mapped_column(JSON_DOC, default=None)

    #: Local clock window in which the director stays quiet, e.g. 22 -> 7.
    quiet_hours_start: Mapped[int | None] = mapped_column(Integer, default=None)
    quiet_hours_end: Mapped[int | None] = mapped_column(Integer, default=None)
    quiet_hours_timezone: Mapped[str] = mapped_column(String(64), default="UTC")
    notification_channels: Mapped[list | None] = mapped_column(JSON_DOC, default=None)


class ProjectDirectorAction(TimestampedBase):
    """One proposed or performed autonomous action — the audit trail. Immutable
    except for its decision and outcome fields."""

    __tablename__ = "project_director_actions"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    action: Mapped[EDirectorAction] = mapped_column(DIRECTOR_ACTION_ENUM)
    status: Mapped[EActionStatus] = mapped_column(
        ACTION_STATUS_ENUM, default=EActionStatus.PENDING, index=True
    )
    #: What the action would do — work-item codes, fields, values.
    payload: Mapped[dict | None] = mapped_column(JSON_DOC, default=None)
    #: Why the director wants it, in its own words, for the human deciding.
    reason: Mapped[str] = mapped_column(Text, default="")
    #: Why the policy said it needs a human (or nothing, when auto-approved).
    policy_reason: Mapped[str] = mapped_column(Text, default="")

    requested_by_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    requested_by_name: Mapped[str] = mapped_column(String(120), default="")
    decided_by_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    decided_by_name: Mapped[str | None] = mapped_column(String(120), default=None)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    decision_note: Mapped[str] = mapped_column(Text, default="")

    #: Ties the action to the control run and to the bulk operation it produced.
    correlation_id: Mapped[str | None] = mapped_column(String(64), default=None, index=True)
    #: What executing it actually did — including the previous values, so a
    #: rollback has something to restore.
    result: Mapped[dict | None] = mapped_column(JSON_DOC, default=None)
