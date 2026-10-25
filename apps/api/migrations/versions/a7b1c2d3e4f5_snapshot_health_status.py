"""GIN-339: record health status on forecast snapshots (for material-change alerts).

Adds `health_status` + `forecast_vs_target` to `forecast_snapshots` so a recalc can
detect a material health change vs the prior snapshot and alert responsible users.
Both nullable (older snapshots predate them).

Revision ID: a7b1c2d3e4f5
Revises: f6d4b8e02a15
Create Date: 2026-07-21
"""

import sqlalchemy as sa
from alembic import op

revision = "a7b1c2d3e4f5"
down_revision = "f6d4b8e02a15"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("forecast_snapshots", sa.Column("health_status", sa.String(length=20), nullable=True))
    op.add_column(
        "forecast_snapshots", sa.Column("forecast_vs_target", sa.String(length=20), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("forecast_snapshots", "forecast_vs_target")
    op.drop_column("forecast_snapshots", "health_status")
