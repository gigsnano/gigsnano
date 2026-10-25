"""digest customization: digest_preferences (GIN-100).

Revision ID: e6b1f4a2c8d3
Revises: d5a8b3c1e7f2
Create Date: 2026-07-16
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "e6b1f4a2c8d3"
down_revision = "d5a8b3c1e7f2"
branch_labels = None
depends_on = None

# create_type=False so create_table doesn't emit a duplicate CREATE TYPE (the
# explicit `.create()` below owns it).
_FREQ = postgresql.ENUM("daily", "weekly", name="digest_frequency", create_type=False)


def upgrade() -> None:
    _FREQ.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "digest_preferences",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("frequency", _FREQ, nullable=False),
        sa.Column("weekly_day", sa.Integer(), nullable=False),
        sa.Column("statuses", sa.JSON(), nullable=False),
        sa.Column("channels", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index("ix_digest_preferences_user_id", "digest_preferences", ["user_id"])


def downgrade() -> None:
    op.drop_table("digest_preferences")
    _FREQ.drop(op.get_bind(), checkfirst=True)
