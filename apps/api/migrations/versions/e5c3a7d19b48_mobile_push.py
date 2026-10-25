"""mobile push

Expo device tokens, the push outbox a worker drains, and the per-user real-time
push switch.

Revision ID: e5c3a7d19b48
Revises: d4b8f1a62e37
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "e5c3a7d19b48"
down_revision = "d4b8f1a62e37"
branch_labels = None
depends_on = None

_JSON_DOC = sa.JSON(none_as_null=True).with_variant(
    postgresql.JSONB(none_as_null=True, astext_type=sa.Text()), "postgresql"
)


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("push_realtime", sa.Boolean(), nullable=False, server_default=sa.true()),
    )

    op.create_table(
        "device_tokens",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("token", sa.String(200), nullable=False),
        sa.Column("platform", sa.String(10), nullable=False),
        sa.Column("device_name", sa.String(120), nullable=False, server_default=""),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_device_tokens_user_id", "device_tokens", ["user_id"])
    op.create_index("ix_device_tokens_token", "device_tokens", ["token"], unique=True)

    op.create_table(
        "push_outbox",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("category", sa.String(20), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("body", sa.String(300), nullable=False, server_default=""),
        sa.Column("data", _JSON_DOC, nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("outcome", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_push_outbox_user_id", "push_outbox", ["user_id"])
    op.create_index("ix_push_outbox_sent_at", "push_outbox", ["sent_at"])


def downgrade() -> None:
    op.drop_index("ix_push_outbox_sent_at", table_name="push_outbox")
    op.drop_index("ix_push_outbox_user_id", table_name="push_outbox")
    op.drop_table("push_outbox")
    op.drop_index("ix_device_tokens_token", table_name="device_tokens")
    op.drop_index("ix_device_tokens_user_id", table_name="device_tokens")
    op.drop_table("device_tokens")
    op.drop_column("users", "push_realtime")
