"""GIN-416: system_audit_events — multi-repo audit trail.

Revision ID: d1f4b8c2e6a9
Revises: c9e3a7b41d28
Create Date: 2026-07-24
"""

import sqlalchemy as sa
from alembic import op

revision = "d1f4b8c2e6a9"
down_revision = "c9e3a7b41d28"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "system_audit_events",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("actor_user_id", sa.String(length=36), nullable=True),
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column("object_type", sa.String(length=40), nullable=False),
        sa.Column("object_id", sa.String(length=36), nullable=True),
        sa.Column("before_summary", sa.Text(), nullable=False, server_default=""),
        sa.Column("after_summary", sa.Text(), nullable=False, server_default=""),
        sa.Column("reason", sa.Text(), nullable=False, server_default=""),
        sa.Column("correlation_id", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_system_audit_events_project_id", "system_audit_events", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_system_audit_events_project_id", table_name="system_audit_events")
    op.drop_table("system_audit_events")
