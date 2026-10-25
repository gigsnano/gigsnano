"""GIN-287: execution_profiles — persisted profile + overrides + policy.

Revision ID: ec4f7a9b2d10
Revises: f2a3b4c5d6e7
Create Date: 2026-07-19
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "ec4f7a9b2d10"
down_revision = "f2a3b4c5d6e7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "execution_profiles",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("story_id", sa.String(length=36),
                  sa.ForeignKey("stories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agent", sa.String(length=20), nullable=False, server_default="auto"),
        sa.Column("policy", sa.String(length=10), nullable=False, server_default="suggest"),
        sa.Column("snapshot", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("overrides", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("override_history", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("story_id", name="uq_execution_profile_story"),
    )


def downgrade() -> None:
    op.drop_table("execution_profiles")
