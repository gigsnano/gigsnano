"""GIN-394: document packages + artifact provenance columns.

Revision ID: e7c4b1a95d20
Revises: c4e9a7b21f30
Create Date: 2026-07-23
"""

import sqlalchemy as sa
from alembic import op

revision = "e7c4b1a95d20"
down_revision = "c4e9a7b21f30"
branch_labels = None
depends_on = None

# No sa.Enum anywhere in this migration: every new column is a plain String, so
# there is no CREATE TYPE that could run twice and abort the upgrade on deploy.
_ARTIFACT_COLUMNS = (
    sa.Column("package_id", sa.String(length=36), nullable=True),
    sa.Column("uploaded_by_id", sa.String(length=36), nullable=True),
    sa.Column("source_attribution", sa.String(length=200), nullable=True),
    sa.Column("canonical", sa.Boolean(), nullable=False, server_default=sa.false()),
    sa.Column("parse_state", sa.String(length=20), nullable=True),
    sa.Column("parse_error", sa.String(length=300), nullable=True),
    sa.Column("byte_size", sa.Integer(), nullable=True),
    sa.Column("checksum", sa.String(length=64), nullable=True),
    sa.Column("original_path", sa.String(length=500), nullable=True),
)


def upgrade() -> None:
    op.create_table(
        "document_packages",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="uploaded"),
        sa.Column("created_by_id", sa.String(length=36), nullable=True),
        sa.Column("created_by_name", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("correlation_id", sa.String(length=64), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_document_packages_project_id", "document_packages", ["project_id"])

    for column in _ARTIFACT_COLUMNS:
        op.add_column("artifacts", column)
    op.create_foreign_key(
        "fk_artifacts_package_id",
        "artifacts",
        "document_packages",
        ["package_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_artifacts_uploaded_by_id",
        "artifacts",
        "users",
        ["uploaded_by_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_artifacts_package_id", "artifacts", ["package_id"])


def downgrade() -> None:
    op.drop_index("ix_artifacts_package_id", table_name="artifacts")
    op.drop_constraint("fk_artifacts_uploaded_by_id", "artifacts", type_="foreignkey")
    op.drop_constraint("fk_artifacts_package_id", "artifacts", type_="foreignkey")
    for column in reversed(_ARTIFACT_COLUMNS):
        op.drop_column("artifacts", column.name)
    op.drop_index("ix_document_packages_project_id", table_name="document_packages")
    op.drop_table("document_packages")
