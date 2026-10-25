"""export_jobs created_by — scope list/download to the creator

Revision ID: 262b3805962c
Revises: b7c8d9e0f1a2
Create Date: 2026-07-10 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "262b3805962c"
down_revision: Union[str, Sequence[str], None] = "b7c8d9e0f1a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "export_jobs",
        sa.Column(
            "created_by",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_export_jobs_created_by", "export_jobs", ["created_by"])


def downgrade() -> None:
    op.drop_index("ix_export_jobs_created_by", table_name="export_jobs")
    op.drop_column("export_jobs", "created_by")
