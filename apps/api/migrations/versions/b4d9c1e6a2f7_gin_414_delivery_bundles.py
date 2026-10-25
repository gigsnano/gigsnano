"""GIN-414: delivery_bundles + delivery_repositories.

Coordinated multi-repo delivery for one work item. Overall state is computed, not
stored. New feature — no data backfill.

Revision ID: b4d9c1e6a2f7
Revises: a3c8e2f14b90
Create Date: 2026-07-24
"""

import sqlalchemy as sa
from alembic import op

revision = "b4d9c1e6a2f7"
down_revision = "a3c8e2f14b90"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "delivery_bundles",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("work_item_id", sa.String(length=36), nullable=False),
        sa.Column("code_scope_id", sa.String(length=36), nullable=True),
        sa.Column("bundle_version_id", sa.String(length=36), nullable=True),
        sa.Column("branch_name", sa.String(length=300), nullable=False, server_default=""),
        sa.Column("cancelled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("rollback_required", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_by", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["work_item_id"], ["stories.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("work_item_id", name="uq_delivery_work_item"),
    )
    op.create_index("ix_delivery_bundles_work_item_id", "delivery_bundles", ["work_item_id"])

    op.create_table(
        "delivery_repositories",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("delivery_bundle_id", sa.String(length=36), nullable=False),
        sa.Column("project_repository_id", sa.String(length=36), nullable=False),
        sa.Column("base_branch", sa.String(length=200), nullable=False, server_default="main"),
        sa.Column("head_branch", sa.String(length=300), nullable=False, server_default=""),
        sa.Column("commit_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("pr_url", sa.String(length=500), nullable=False, server_default=""),
        sa.Column("pr_id", sa.String(length=64), nullable=False, server_default=""),
        sa.Column("required", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("ci_state", sa.String(length=20), nullable=False, server_default="none"),
        sa.Column("review_state", sa.String(length=20), nullable=False, server_default="none"),
        sa.Column("merge_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("merge_state", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("no_change", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("change_summary", sa.Text(), nullable=False, server_default=""),
        sa.Column("deployment_impact", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["delivery_bundle_id"], ["delivery_bundles.id"], ondelete="CASCADE"
        ),
        sa.UniqueConstraint(
            "delivery_bundle_id", "project_repository_id", name="uq_delivery_repo_identity"
        ),
    )
    op.create_index(
        "ix_delivery_repositories_delivery_bundle_id",
        "delivery_repositories",
        ["delivery_bundle_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_delivery_repositories_delivery_bundle_id", table_name="delivery_repositories"
    )
    op.drop_table("delivery_repositories")
    op.drop_index("ix_delivery_bundles_work_item_id", table_name="delivery_bundles")
    op.drop_table("delivery_bundles")
