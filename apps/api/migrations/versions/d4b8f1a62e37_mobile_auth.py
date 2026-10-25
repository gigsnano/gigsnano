"""mobile auth

Sign in with Apple identities on users, and rotating refresh-token families for
the mobile app (opaque tokens stored as sha256 hashes).

Revision ID: d4b8f1a62e37
Revises: c7a2e91f4d10
"""

import sqlalchemy as sa
from alembic import op

revision = "d4b8f1a62e37"
down_revision = "c7a2e91f4d10"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("apple_sub", sa.String(255), nullable=True))
    op.create_index("ix_users_apple_sub", "users", ["apple_sub"], unique=True)

    op.create_table(
        "mobile_refresh_tokens",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("family_id", sa.String(36), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("device_name", sa.String(120), nullable=False, server_default=""),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_mobile_refresh_tokens_user_id", "mobile_refresh_tokens", ["user_id"])
    op.create_index("ix_mobile_refresh_tokens_family_id", "mobile_refresh_tokens", ["family_id"])
    op.create_index(
        "ix_mobile_refresh_tokens_token_hash", "mobile_refresh_tokens", ["token_hash"], unique=True
    )


def downgrade() -> None:
    op.drop_index("ix_mobile_refresh_tokens_token_hash", table_name="mobile_refresh_tokens")
    op.drop_index("ix_mobile_refresh_tokens_family_id", table_name="mobile_refresh_tokens")
    op.drop_index("ix_mobile_refresh_tokens_user_id", table_name="mobile_refresh_tokens")
    op.drop_table("mobile_refresh_tokens")
    op.drop_index("ix_users_apple_sub", table_name="users")
    op.drop_column("users", "apple_sub")
