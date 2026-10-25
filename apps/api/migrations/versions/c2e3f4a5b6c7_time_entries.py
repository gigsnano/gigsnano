"""time_entries table (GIN-55 time tracking)

Revision ID: c2e3f4a5b6c7
Revises: b1d2a3c4e5f6
Create Date: 2026-07-13

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c2e3f4a5b6c7"
down_revision: Union[str, Sequence[str], None] = "b1d2a3c4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "time_entries",
        sa.Column("story_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=True),
        sa.Column("user_name", sa.String(length=120), nullable=False),
        sa.Column("user_avatar_url", sa.String(length=500), nullable=True),
        sa.Column("hours", sa.Float(), nullable=False),
        sa.Column("note", sa.Text(), nullable=False, server_default=""),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["story_id"], ["stories.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_time_entries_story_id", "time_entries", ["story_id"], unique=False)
    op.create_index("ix_time_entries_user_id", "time_entries", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_time_entries_user_id", table_name="time_entries")
    op.drop_index("ix_time_entries_story_id", table_name="time_entries")
    op.drop_table("time_entries")
