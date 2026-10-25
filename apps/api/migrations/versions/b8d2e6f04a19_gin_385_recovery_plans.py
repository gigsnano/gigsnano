"""GIN-385: persisted recovery plans + their per-change rows.

A recovery plan stored as Markdown gets read once and rots. Stored as rows it can
be approved change-by-change, applied, and undone — which is the whole point.

Hand-written: autogenerate runs against the shared prod DB and mixes in unrelated
pre-existing drift.

Revision ID: b8d2e6f04a19
Revises: d6b4a8f13c07
Create Date: 2026-07-22
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "b8d2e6f04a19"
down_revision = "d6b4a8f13c07"
branch_labels = None
depends_on = None

_PLAN_STATUS = sa.Enum(
    "draft", "approved", "applied", "rejected", "rolled_back", name="recovery_plan_status"
)
_CHANGE_STATUS = sa.Enum(
    "proposed", "approved", "rejected", "applied", "failed", "rolled_back",
    name="recovery_change_status",
)


# Enum objects passed to create_table would emit CREATE TYPE a second time —
# the explicit create() below already made them. `create_type=False` columns
# reference the existing type instead (this is what took prod down once).
_PLAN_STATUS_COL = postgresql.ENUM(
    
    "draft", "approved", "applied", "rejected", "rolled_back", name="recovery_plan_status", create_type=False
)
_CHANGE_STATUS_COL = postgresql.ENUM(
    
    "proposed", "approved", "rejected", "applied", "failed", "rolled_back", name="recovery_change_status", create_type=False
)


def upgrade() -> None:
    bind = op.get_bind()
    _PLAN_STATUS.create(bind, checkfirst=True)
    _CHANGE_STATUS.create(bind, checkfirst=True)

    op.create_table(
        "recovery_plans",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("status", _PLAN_STATUS_COL, nullable=False),
        sa.Column("created_by_id", sa.String(length=36), nullable=True),
        sa.Column("created_by_name", sa.String(length=120), nullable=False),
        sa.Column("correlation_id", sa.String(length=64), nullable=False),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("applied_by_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["applied_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_recovery_plans_project_id"), "recovery_plans", ["project_id"])
    op.create_index(op.f("ix_recovery_plans_status"), "recovery_plans", ["status"])

    op.create_table(
        "recovery_plan_changes",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("plan_id", sa.String(length=36), nullable=False),
        sa.Column("code", sa.String(length=40), nullable=False),
        sa.Column("field", sa.String(length=40), nullable=False),
        sa.Column("current_value", sa.String(length=300), nullable=True),
        sa.Column("proposed_value", sa.String(length=300), nullable=True),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("evidence", sa.Text(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("status", _CHANGE_STATUS_COL, nullable=False),
        sa.Column("previous_value", sa.String(length=300), nullable=True),
        sa.Column("error", sa.Text(), nullable=False),
        sa.Column("decided_by_id", sa.String(length=36), nullable=True),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["plan_id"], ["recovery_plans.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["decided_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_recovery_plan_changes_plan_id"), "recovery_plan_changes", ["plan_id"]
    )
    op.create_index(
        op.f("ix_recovery_plan_changes_status"), "recovery_plan_changes", ["status"]
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_recovery_plan_changes_status"), table_name="recovery_plan_changes")
    op.drop_index(op.f("ix_recovery_plan_changes_plan_id"), table_name="recovery_plan_changes")
    op.drop_table("recovery_plan_changes")
    op.drop_index(op.f("ix_recovery_plans_status"), table_name="recovery_plans")
    op.drop_index(op.f("ix_recovery_plans_project_id"), table_name="recovery_plans")
    op.drop_table("recovery_plans")
    bind = op.get_bind()
    _CHANGE_STATUS.drop(bind, checkfirst=True)
    _PLAN_STATUS.drop(bind, checkfirst=True)
