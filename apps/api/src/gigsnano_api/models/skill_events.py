"""Append-only skill delivery/verification event log (GIN-289). Proves what was
delivered to an agent and what the agent verified — delivery and invocation are
distinct states, never conflated."""

import enum

from sqlalchemy import JSON, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import TimestampedBase, _values


class ESkillEventState(str, enum.Enum):
    SELECTED = "selected"
    RESOLVED = "resolved"
    DOWNLOADED = "downloaded"
    DIGEST_VERIFIED = "digest_verified"
    MATERIALIZED = "materialized"
    AGENT_ACKNOWLEDGED = "agent_acknowledged"
    AGENT_REPORTED_INVOKED = "agent_reported_invoked"
    GATE_VERIFIED = "gate_verified"
    FAILED = "failed"
    SKIPPED = "skipped"
    REVOKED = "revoked"


_STATE_ENUM = Enum(ESkillEventState, name="skill_event_state", values_callable=_values)


class SkillEvent(TimestampedBase):
    __tablename__ = "skill_events"
    # Idempotency: the same (run, dedupe_key) is ingested at most once. This
    # constraint also backs the SQLite test engine (create_all reads it).
    __table_args__ = (
        UniqueConstraint("run_id", "dedupe_key", name="uq_skill_event_run_dedupe"),
    )

    run_id: Mapped[str] = mapped_column(
        ForeignKey("agent_runs.id", ondelete="CASCADE"), index=True
    )
    skill_id: Mapped[str] = mapped_column(String(120))
    version: Mapped[str | None] = mapped_column(String(20), default=None)
    digest: Mapped[str | None] = mapped_column(String(71), default=None)
    state: Mapped[ESkillEventState] = mapped_column(_STATE_ENUM)
    agent: Mapped[str | None] = mapped_column(String(20), default=None)
    gate: Mapped[str | None] = mapped_column(String(60), default=None)
    evidence: Mapped[list] = mapped_column(JSON().with_variant(JSONB(), "postgresql"), default=list)
    reason: Mapped[str | None] = mapped_column(String(500), default=None)
    dedupe_key: Mapped[str] = mapped_column(String(200))
