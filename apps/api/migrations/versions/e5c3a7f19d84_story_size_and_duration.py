"""GIN-331: per-method estimate inputs on stories (simple size + time duration).

Adds two nullable columns to `stories`:
  - `size` — an ESimpleSize value ("xs".."xl") for the "simple" planning method.
  - `duration_minutes` — whole minutes for the "time" method.

Both are nullable with no default: existing rows stay explicitly unestimated
(null, never zero). Independent of `estimate_points` so switching a project's
planning method preserves each mode's prior raw value.

Revision ID: e5c3a7f19d84
Revises: c7d1e9a4b6f2
Create Date: 2026-07-21
"""

import sqlalchemy as sa
from alembic import op

revision = "e5c3a7f19d84"
down_revision = "c7d1e9a4b6f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("stories", sa.Column("size", sa.String(length=2), nullable=True))
    op.add_column("stories", sa.Column("duration_minutes", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("stories", "duration_minutes")
    op.drop_column("stories", "size")
