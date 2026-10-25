"""GIN-337: PM-reported project health updates.

Append-only, versioned PM health judgments stored separately from system health.

Revision ID: b4e2f8a1c9d7
Revises: d4b1e9c66a72
Create Date: 2026-07-21
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "b4e2f8a1c9d7"
down_revision = "d4b1e9c66a72"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "pm_health_updates",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column(
            "reported_status",
            sa.Enum("on_track", "at_risk", "off_track", name="pm_health_status"),
            nullable=False,
        ),
        sa.Column("narrative", sa.Text(), nullable=False),
        sa.Column("key_risks", sa.Text(), nullable=True),
        sa.Column("next_milestone", sa.String(length=300), nullable=True),
        sa.Column("next_milestone_date", sa.Date(), nullable=True),
        sa.Column("decision_needed", sa.Text(), nullable=True),
        sa.Column("recovery_owner_id", sa.String(length=36), nullable=True),
        sa.Column("next_review_date", sa.Date(), nullable=True),
        sa.Column("work_item_refs", postgresql.JSONB(none_as_null=True), nullable=True),
        sa.Column("author_id", sa.String(length=36), nullable=True),
        sa.Column("author_name", sa.String(length=120), nullable=False),
        sa.Column("retracted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["recovery_owner_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_pm_health_updates_project_id", "pm_health_updates", ["project_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_pm_health_updates_project_id", table_name="pm_health_updates")
    op.drop_table("pm_health_updates")
    op.execute("DROP TYPE IF EXISTS pm_health_status")
