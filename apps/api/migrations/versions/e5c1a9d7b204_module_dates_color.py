"""GIN-380: module start/target dates + color.

Nullable metadata on `modules` so a module can carry a schedule and a swatch
like a cycle does. Nothing backfills — existing modules simply have none.

Revision ID: e5c1a9d7b204
Revises: a7b1c2d3e4f5
Create Date: 2026-07-22
"""

import sqlalchemy as sa
from alembic import op

revision = "e5c1a9d7b204"
down_revision = "a7b1c2d3e4f5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("modules", sa.Column("start_date", sa.Date(), nullable=True))
    op.add_column("modules", sa.Column("target_date", sa.Date(), nullable=True))
    op.add_column("modules", sa.Column("color", sa.String(length=9), nullable=True))


def downgrade() -> None:
    op.drop_column("modules", "color")
    op.drop_column("modules", "target_date")
    op.drop_column("modules", "start_date")
