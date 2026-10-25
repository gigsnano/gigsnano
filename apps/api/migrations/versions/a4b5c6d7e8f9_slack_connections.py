"""slack_connections table

Revision ID: a4b5c6d7e8f9
Revises: 4572129e32f2
Create Date: 2026-07-10

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a4b5c6d7e8f9"
down_revision: Union[str, Sequence[str], None] = "4572129e32f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "slack_connections",
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("access_token_encrypted", sa.Text(), nullable=False),
        sa.Column("team_id", sa.String(length=40), nullable=False),
        sa.Column("team_name", sa.String(length=200), nullable=False),
        sa.Column("bot_user_id", sa.String(length=40), nullable=False),
        sa.Column("default_channel_id", sa.String(length=40), nullable=True),
        sa.Column("default_channel_name", sa.String(length=200), nullable=True),
        sa.Column("notify_events", sa.JSON(), nullable=False),
        sa.Column("connected_by", sa.String(length=36), nullable=True),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["connected_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("workspace_id", name="uq_slack_connections_workspace_id"),
    )


def downgrade() -> None:
    op.drop_table("slack_connections")
