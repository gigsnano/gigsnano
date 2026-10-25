"""GIN-415: source_snapshots — immutable exact-commit record per execution.

Revision ID: c9e3a7b41d28
Revises: b4d9c1e6a2f7
Create Date: 2026-07-24
"""

import sqlalchemy as sa
from alembic import op

from gigsnano_api.models.base import JSON_DOC

revision = "c9e3a7b41d28"
down_revision = "b4d9c1e6a2f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "source_snapshots",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("work_item_id", sa.String(length=36), nullable=True),
        sa.Column("bundle_version_id", sa.String(length=36), nullable=True),
        sa.Column("agent_run_id", sa.String(length=36), nullable=True),
        sa.Column("deployment_run_id", sa.String(length=36), nullable=True),
        sa.Column("repository_commits_json", JSON_DOC, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_source_snapshots_project_id", "source_snapshots", ["project_id"])
    op.create_index("ix_source_snapshots_work_item_id", "source_snapshots", ["work_item_id"])


def downgrade() -> None:
    op.drop_index("ix_source_snapshots_work_item_id", table_name="source_snapshots")
    op.drop_index("ix_source_snapshots_project_id", table_name="source_snapshots")
    op.drop_table("source_snapshots")
