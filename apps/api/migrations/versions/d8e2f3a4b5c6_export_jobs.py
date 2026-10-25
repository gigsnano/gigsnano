"""export_jobs table

Revision ID: d8e2f3a4b5c6
Revises: c7f1a2b3d4e5
Create Date: 2026-07-05

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d8e2f3a4b5c6"
down_revision: Union[str, Sequence[str], None] = "c7f1a2b3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "export_jobs",
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("format", sa.String(length=8), nullable=False),
        sa.Column(
            "status",
            sa.Enum("pending", "ready", "failed", name="export_status"),
            nullable=False,
        ),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_export_jobs_workspace_id"), "export_jobs", ["workspace_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_export_jobs_workspace_id"), table_name="export_jobs")
    op.drop_table("export_jobs")
    op.execute("DROP TYPE IF EXISTS export_status")
