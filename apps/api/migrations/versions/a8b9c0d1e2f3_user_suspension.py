"""user suspension

Revision ID: a8b9c0d1e2f3
Revises: 59f4d48d27f3
Create Date: 2026-07-04 19:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a8b9c0d1e2f3"
down_revision: Union[str, Sequence[str], None] = "f4a6b8c0d2e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_suspended", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "users",
        sa.Column("suspended_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(op.f("ix_users_is_suspended"), "users", ["is_suspended"], unique=False)
    op.alter_column("users", "is_suspended", server_default=None)


def downgrade() -> None:
    op.drop_index(op.f("ix_users_is_suspended"), table_name="users")
    op.drop_column("users", "suspended_at")
    op.drop_column("users", "is_suspended")
