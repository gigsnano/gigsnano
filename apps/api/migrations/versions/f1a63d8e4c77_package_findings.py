"""GIN-395: package findings — typed, source-anchored analysis results.

Revision ID: f1a63d8e4c77
Revises: e7c4b1a95d20
Create Date: 2026-07-23
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "f1a63d8e4c77"
down_revision = "e7c4b1a95d20"
branch_labels = None
depends_on = None

# kind/status are plain Strings, not sa.Enum — the vocabulary grows with later
# slices, and altering a DB enum in place is the migration hazard we avoid.
_JSON = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def upgrade() -> None:
    op.create_table(
        "package_findings",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("package_id", sa.String(length=36), nullable=False),
        sa.Column("document_id", sa.String(length=36), nullable=True),
        sa.Column("kind", sa.String(length=30), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="proposed"),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("detail", sa.Text(), nullable=False, server_default=""),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="0.5"),
        sa.Column("anchor", sa.String(length=300), nullable=False, server_default=""),
        sa.Column("anchor_start", sa.Integer(), nullable=True),
        sa.Column("anchor_end", sa.Integer(), nullable=True),
        sa.Column("source_excerpt", sa.Text(), nullable=False, server_default=""),
        sa.Column("override", _JSON, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["package_id"], ["document_packages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["document_id"], ["artifacts.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_package_findings_package_id", "package_findings", ["package_id"])
    op.create_index("ix_package_findings_document_id", "package_findings", ["document_id"])


def downgrade() -> None:
    op.drop_index("ix_package_findings_document_id", table_name="package_findings")
    op.drop_index("ix_package_findings_package_id", table_name="package_findings")
    op.drop_table("package_findings")
