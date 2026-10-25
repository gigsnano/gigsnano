"""role-based digest templates: digest_preferences.template (GIN-102).

Revision ID: f7c2d9a1b3e4
Revises: e6b1f4a2c8d3
Create Date: 2026-07-16
"""

import sqlalchemy as sa
from alembic import op

revision = "f7c2d9a1b3e4"
down_revision = "e6b1f4a2c8d3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "digest_preferences",
        sa.Column(
            "template",
            sa.String(length=20),
            nullable=False,
            server_default="default",
        ),
    )


def downgrade() -> None:
    op.drop_column("digest_preferences", "template")
