"""mobile handoff codes

Single-use codes that hand a signed-in web session to the mobile app, bound to the
app's PKCE challenge and redirect URI. Only the SHA-256 of each code is stored.

Revision ID: f7a2c9e41d05
Revises: e5c3a7d19b48
"""

import sqlalchemy as sa
from alembic import op

revision = "f7a2c9e41d05"
down_revision = "e5c3a7d19b48"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "mobile_handoff_codes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("code_hash", sa.String(64), nullable=False),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("code_challenge", sa.String(128), nullable=False),
        sa.Column("redirect_uri", sa.String(300), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_mobile_handoff_codes_code_hash", "mobile_handoff_codes", ["code_hash"], unique=True
    )
    op.create_index("ix_mobile_handoff_codes_user_id", "mobile_handoff_codes", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_mobile_handoff_codes_user_id", table_name="mobile_handoff_codes")
    op.drop_index("ix_mobile_handoff_codes_code_hash", table_name="mobile_handoff_codes")
    op.drop_table("mobile_handoff_codes")
