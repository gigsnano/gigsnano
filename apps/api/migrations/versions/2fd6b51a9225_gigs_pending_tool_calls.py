"""gigs pending_tool_calls

Revision ID: 2fd6b51a9225
Revises: 9786c6da7d65
Create Date: 2026-07-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "2fd6b51a9225"
down_revision: Union[str, Sequence[str], None] = "9786c6da7d65"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "gigs_threads", sa.Column("pending_tool_calls", sa.JSON(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("gigs_threads", "pending_tool_calls")
