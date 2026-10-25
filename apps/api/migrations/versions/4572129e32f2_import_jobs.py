"""import_jobs + imported_entity_refs tables

Revision ID: 4572129e32f2
Revises: 6212f1037f52
Create Date: 2026-07-10

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "4572129e32f2"
down_revision: Union[str, Sequence[str], None] = "6212f1037f52"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "import_jobs",
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("source_format", sa.String(length=8), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "queued", "parsing", "importing", "completed",
                "completed_with_errors", "failed",
                name="import_status",
            ),
            nullable=False,
        ),
        sa.Column("raw_content", sa.Text(), nullable=False),
        sa.Column("summary", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.String(length=36), nullable=True),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_import_jobs_workspace_id"), "import_jobs", ["workspace_id"], unique=False
    )
    op.create_index(
        op.f("ix_import_jobs_created_by"), "import_jobs", ["created_by"], unique=False
    )

    op.create_table(
        "imported_entity_refs",
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("entity_type", sa.String(length=20), nullable=False),
        sa.Column("external_key", sa.String(length=300), nullable=False),
        sa.Column("gigsnano_id", sa.String(length=36), nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "workspace_id", "entity_type", "external_key",
            name="uq_imported_entity_refs_workspace_type_key",
        ),
    )
    op.create_index(
        op.f("ix_imported_entity_refs_workspace_id"),
        "imported_entity_refs", ["workspace_id"], unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_imported_entity_refs_workspace_id"), table_name="imported_entity_refs"
    )
    op.drop_table("imported_entity_refs")
    op.drop_index(op.f("ix_import_jobs_created_by"), table_name="import_jobs")
    op.drop_index(op.f("ix_import_jobs_workspace_id"), table_name="import_jobs")
    op.drop_table("import_jobs")
    op.execute("DROP TYPE IF EXISTS import_status")
