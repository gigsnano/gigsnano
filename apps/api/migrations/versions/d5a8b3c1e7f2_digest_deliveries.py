"""daily work digest: digest_deliveries (GIN-103).

Revision ID: d5a8b3c1e7f2
Revises: c4d9e2f6a1b3
Create Date: 2026-07-16
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "d5a8b3c1e7f2"
down_revision = "c4d9e2f6a1b3"
branch_labels = None
depends_on = None

# create_type=False so the enum is only created by the explicit `.create()` below —
# without it, create_table would emit a second CREATE TYPE and fail on Postgres.
_STATUS = postgresql.ENUM(
    "pending", "sent", "failed", "skipped", name="digest_status", create_type=False
)


def upgrade() -> None:
    _STATUS.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "digest_deliveries",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("run_date", sa.Date(), nullable=False),
        sa.Column("status", _STATUS, nullable=False),
        sa.Column("channels", sa.JSON(), nullable=False),
        sa.Column("item_count", sa.Integer(), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("clicked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("subject", sa.String(length=300), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "workspace_id", "run_date"),
    )
    op.create_index("ix_digest_deliveries_workspace_id", "digest_deliveries", ["workspace_id"])
    op.create_index("ix_digest_deliveries_user_id", "digest_deliveries", ["user_id"])
    op.create_index("ix_digest_deliveries_run_date", "digest_deliveries", ["run_date"])


def downgrade() -> None:
    op.drop_table("digest_deliveries")
    _STATUS.drop(op.get_bind(), checkfirst=True)
