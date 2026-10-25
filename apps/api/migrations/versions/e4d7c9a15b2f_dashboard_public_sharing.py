"""dashboard public sharing (GIN-489)

Revision ID: e4d7c9a15b2f
Revises: a2cadeac13d8
Create Date: 2026-07-27

Adds the visibility/token columns that back a public dashboard link. Existing
rows default to "private" — publishing is always an explicit action.
"""

import sqlalchemy as sa
from alembic import op

revision = "e4d7c9a15b2f"
down_revision = "a2cadeac13d8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "dashboards",
        sa.Column(
            "visibility",
            sa.String(length=16),
            nullable=False,
            server_default="private",
        ),
    )
    op.add_column("dashboards", sa.Column("public_token", sa.String(length=64), nullable=True))
    op.add_column(
        "dashboards", sa.Column("published_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("dashboards", sa.Column("published_by", sa.String(length=36), nullable=True))
    op.add_column(
        "dashboards",
        sa.Column("public_token_rotated_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Unique: the token IS the credential, so two dashboards must never share one.
    op.create_index(
        "ix_dashboards_public_token", "dashboards", ["public_token"], unique=True
    )
    op.create_foreign_key(
        "fk_dashboards_published_by_users",
        "dashboards",
        "users",
        ["published_by"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_dashboards_published_by_users", "dashboards", type_="foreignkey")
    op.drop_index("ix_dashboards_public_token", table_name="dashboards")
    op.drop_column("dashboards", "public_token_rotated_at")
    op.drop_column("dashboards", "published_by")
    op.drop_column("dashboards", "published_at")
    op.drop_column("dashboards", "public_token")
    op.drop_column("dashboards", "visibility")
