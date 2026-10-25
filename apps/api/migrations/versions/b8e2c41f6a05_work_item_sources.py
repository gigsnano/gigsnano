"""GIN-398: work_item_sources — durable document→work-item provenance.

Revision ID: b8e2c41f6a05
Revises: a2d5f70b9e14
Create Date: 2026-07-23
"""

import sqlalchemy as sa
from alembic import op

revision = "b8e2c41f6a05"
down_revision = "a2d5f70b9e14"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "work_item_sources",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("story_id", sa.String(length=36), nullable=False),
        sa.Column("document_id", sa.String(length=36), nullable=True),
        sa.Column("package_id", sa.String(length=36), nullable=True),
        sa.Column("document_name", sa.String(length=300), nullable=False, server_default=""),
        sa.Column("anchor", sa.String(length=300), nullable=False, server_default=""),
        sa.Column("anchor_start", sa.Integer(), nullable=True),
        sa.Column("anchor_end", sa.Integer(), nullable=True),
        sa.Column("document_version", sa.Integer(), nullable=True),
        sa.Column("finding_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["story_id"], ["stories.id"], ondelete="CASCADE"),
        # SET NULL, not CASCADE: deleting the source document must not delete the
        # provenance record — document_name/anchor still say where work came from.
        sa.ForeignKeyConstraint(["document_id"], ["artifacts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["package_id"], ["document_packages.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["finding_id"], ["package_findings.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_work_item_sources_story_id", "work_item_sources", ["story_id"])
    op.create_index("ix_work_item_sources_document_id", "work_item_sources", ["document_id"])
    op.create_index("ix_work_item_sources_package_id", "work_item_sources", ["package_id"])


def downgrade() -> None:
    op.drop_index("ix_work_item_sources_package_id", table_name="work_item_sources")
    op.drop_index("ix_work_item_sources_document_id", table_name="work_item_sources")
    op.drop_index("ix_work_item_sources_story_id", table_name="work_item_sources")
    op.drop_table("work_item_sources")
