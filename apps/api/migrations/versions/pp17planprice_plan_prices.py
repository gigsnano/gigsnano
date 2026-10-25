"""admin-configured plan prices: plan_prices (GIN-30 Slice 2).

Revision ID: pp17planprice
Revises: f7c2d9a1b3e4
Create Date: 2026-07-16
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "pp17planprice"
down_revision = "f7c2d9a1b3e4"
branch_labels = None
depends_on = None

# Reuse the existing enum types (created with the subscriptions table). Must be
# postgresql.ENUM for create_type=False to actually suppress the CREATE TYPE —
# sa.Enum ignores it and re-emits it (DuplicateObject).
_PLAN_TIER = postgresql.ENUM("free", "pro", "business", name="plan_tier", create_type=False)
_INTERVAL = postgresql.ENUM("monthly", "annual", name="billing_interval", create_type=False)


def upgrade() -> None:
    op.create_table(
        "plan_prices",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("tier", _PLAN_TIER, nullable=False),
        sa.Column("interval", _INTERVAL, nullable=False),
        sa.Column("stripe_product_id", sa.String(length=120), nullable=True),
        sa.Column("stripe_price_id", sa.String(length=120), nullable=True),
        sa.Column("unit_amount_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.UniqueConstraint("tier", "interval"),
    )


def downgrade() -> None:
    op.drop_table("plan_prices")
