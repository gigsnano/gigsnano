"""GIN-413: work_item_code_scopes + work_item_repository_scopes.

A technical work item's chosen System Bundle + per-repo Write/Reference/Excluded
plan, pinned to a bundle version so a later bundle edit can't affect an in-flight
run. New feature — no data backfill.

Revision ID: a3c8e2f14b90
Revises: 39d57a5a4e63
Create Date: 2026-07-24
"""

import sqlalchemy as sa
from alembic import op

revision = "a3c8e2f14b90"
down_revision = "39d57a5a4e63"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "work_item_code_scopes",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("work_item_id", sa.String(length=36), nullable=False),
        sa.Column("bundle_version_id", sa.String(length=36), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
        sa.Column(
            "branch_pattern", sa.String(length=200), nullable=False, server_default="feature/{code}-{slug}"
        ),
        sa.Column("reason", sa.Text(), nullable=False, server_default=""),
        sa.Column("confirmed_by", sa.String(length=36), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["work_item_id"], ["stories.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["bundle_version_id"], ["system_bundle_versions.id"], ondelete="SET NULL"
        ),
        sa.UniqueConstraint("work_item_id", name="uq_code_scope_work_item"),
    )
    op.create_index("ix_work_item_code_scopes_work_item_id", "work_item_code_scopes", ["work_item_id"])

    op.create_table(
        "work_item_repository_scopes",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("code_scope_id", sa.String(length=36), nullable=False),
        sa.Column("project_repository_id", sa.String(length=36), nullable=False),
        sa.Column("mode", sa.String(length=20), nullable=False, server_default="reference"),
        sa.Column("required_delivery", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("base_branch", sa.String(length=200), nullable=False, server_default="main"),
        sa.Column("reason", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["code_scope_id"], ["work_item_code_scopes.id"], ondelete="CASCADE"
        ),
        sa.UniqueConstraint(
            "code_scope_id", "project_repository_id", name="uq_repo_scope_identity"
        ),
    )
    op.create_index(
        "ix_work_item_repository_scopes_code_scope_id",
        "work_item_repository_scopes",
        ["code_scope_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_work_item_repository_scopes_code_scope_id", table_name="work_item_repository_scopes"
    )
    op.drop_table("work_item_repository_scopes")
    op.drop_index("ix_work_item_code_scopes_work_item_id", table_name="work_item_code_scopes")
    op.drop_table("work_item_code_scopes")
