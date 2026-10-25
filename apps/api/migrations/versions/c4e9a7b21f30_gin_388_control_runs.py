"""GIN-388: project control runs.

One table. Columns that would record a model call stay nullable — a run that was
pure analysis must not look like one that asked a model something.

Enum note: the column references the type with create_type=False because the type
is created explicitly above. Passing the same sa.Enum to both is what took prod
down on 2026-07-23 (see tests/test_migration_conventions.py).

Revision ID: c4e9a7b21f30
Revises: b8d2e6f04a19
Create Date: 2026-07-23
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "c4e9a7b21f30"
down_revision = "b8d2e6f04a19"
branch_labels = None
depends_on = None

_STATUS = sa.Enum("completed", "failed", name="control_run_status")
_STATUS_COL = postgresql.ENUM(
    "completed", "failed", name="control_run_status", create_type=False
)

_JSON = sa.JSON(none_as_null=True).with_variant(
    postgresql.JSONB(none_as_null=True), "postgresql"
)


def upgrade() -> None:
    _STATUS.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "project_control_runs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("status", _STATUS_COL, nullable=False),
        sa.Column("window_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("window_to", sa.DateTime(timezone=True), nullable=False),
        sa.Column("findings", _JSON, nullable=True),
        sa.Column("actions_proposed", _JSON, nullable=True),
        sa.Column("actions_executed", _JSON, nullable=True),
        sa.Column("actions_awaiting_approval", _JSON, nullable=True),
        sa.Column("actions_failed", _JSON, nullable=True),
        sa.Column("forecast_before", _JSON, nullable=True),
        sa.Column("forecast_after", _JSON, nullable=True),
        sa.Column("model", sa.String(length=80), nullable=True),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("correlation_id", sa.String(length=64), nullable=False),
        sa.Column("triggered_by_id", sa.String(length=36), nullable=True),
        sa.Column("error", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["triggered_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_project_control_runs_project_id"), "project_control_runs", ["project_id"]
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_project_control_runs_project_id"), table_name="project_control_runs"
    )
    op.drop_table("project_control_runs")
    _STATUS.drop(op.get_bind(), checkfirst=True)
