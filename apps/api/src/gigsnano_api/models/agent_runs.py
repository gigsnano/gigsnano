"""Durable agent-run records (GIN-249): a persona-owned work item executes as a
run with ordered steps. This module is persistence + enums only — the lifecycle
state machine lives in features/agent_runs/lifecycle.py, orchestration in later
stories (GIN-250/251)."""

import enum

from sqlalchemy import JSON, Enum, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.core.db import TimestampedBase
from gigsnano_api.models.base import _values


class EAgentRunState(str, enum.Enum):
    QUEUED = "queued"
    PLANNING = "planning"
    EXECUTING = "executing"
    AWAITING_REVIEW = "awaiting_review"
    DONE = "done"
    FAILED = "failed"
    STOPPED = "stopped"


class EAgentAutonomy(str, enum.Enum):
    SUGGEST = "suggest"
    DRAFT = "draft"
    AUTOPILOT = "autopilot"


class EAgentRunStepKind(str, enum.Enum):
    PLAN = "plan"
    TOOL = "tool"
    ARTIFACT = "artifact"
    PR = "pr"
    NOTE = "note"


_AUTONOMY_ENUM = Enum(EAgentAutonomy, name="agent_autonomy", values_callable=_values)
_RUN_STATE_ENUM = Enum(EAgentRunState, name="agent_run_state", values_callable=_values)
_STEP_KIND_ENUM = Enum(EAgentRunStepKind, name="agent_run_step_kind", values_callable=_values)


class AgentRun(TimestampedBase):
    __tablename__ = "agent_runs"

    story_id: Mapped[str] = mapped_column(
        ForeignKey("stories.id", ondelete="CASCADE"), index=True
    )
    persona_id: Mapped[str] = mapped_column(String(40))  # a BMAD_AGENTS id, e.g. agent_architect
    autonomy: Mapped[EAgentAutonomy] = mapped_column(_AUTONOMY_ENUM, default=EAgentAutonomy.DRAFT)
    state: Mapped[EAgentRunState] = mapped_column(
        _RUN_STATE_ENUM, default=EAgentRunState.QUEUED, index=True
    )
    cost_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float] = mapped_column(Numeric(12, 6), default=0)


class AgentRunStep(TimestampedBase):
    __tablename__ = "agent_run_steps"

    run_id: Mapped[str] = mapped_column(
        ForeignKey("agent_runs.id", ondelete="CASCADE"), index=True
    )
    seq: Mapped[int] = mapped_column(Integer)
    kind: Mapped[EAgentRunStepKind] = mapped_column(_STEP_KIND_ENUM)
    status: Mapped[str] = mapped_column(String(20), default="ok")
    summary: Mapped[str] = mapped_column(String(500), default="")
    payload: Mapped[dict] = mapped_column(JSON, default=dict)  # artifact/PR ref, tool args…
    tokens: Mapped[int] = mapped_column(Integer, default=0)
