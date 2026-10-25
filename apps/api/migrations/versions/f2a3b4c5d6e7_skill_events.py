"""GIN-289: append-only skill_events telemetry log.

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-07-19
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "f2a3b4c5d6e7"
down_revision = "e1f2a3b4c5d6"
branch_labels = None
depends_on = None

_STATES = (
    "selected", "resolved", "downloaded", "digest_verified", "materialized",
    "agent_acknowledged", "agent_reported_invoked", "gate_verified",
    "failed", "skipped", "revoked",
)


def upgrade() -> None:
    op.create_table(
        "skill_events",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("run_id", sa.String(length=36),
                  sa.ForeignKey("agent_runs.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("skill_id", sa.String(length=120), nullable=False),
        sa.Column("version", sa.String(length=20), nullable=True),
        sa.Column("digest", sa.String(length=71), nullable=True),
        sa.Column("state", sa.Enum(*_STATES, name="skill_event_state"), nullable=False),
        sa.Column("agent", sa.String(length=20), nullable=True),
        sa.Column("gate", sa.String(length=60), nullable=True),
        sa.Column("evidence", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("reason", sa.String(length=500), nullable=True),
        sa.Column("dedupe_key", sa.String(length=200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("run_id", "dedupe_key", name="uq_skill_event_run_dedupe"),
    )


def downgrade() -> None:
    op.drop_table("skill_events")
    sa.Enum(name="skill_event_state").drop(op.get_bind(), checkfirst=True)
