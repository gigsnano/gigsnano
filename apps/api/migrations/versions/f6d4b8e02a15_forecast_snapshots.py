"""GIN-335 s2: persisted forecast snapshots.

Retains each Monte Carlo forecast computation (inputs + probability bands +
algorithm version + calculation timestamp) so earlier results can be reproduced
and calibrated against actual outcomes.

Revision ID: f6d4b8e02a15
Revises: e5c3a7f19d84
Create Date: 2026-07-21
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "f6d4b8e02a15"
down_revision = "e5c3a7f19d84"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "forecast_snapshots",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("calculated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("algorithm_version", sa.String(length=40), nullable=False),
        sa.Column("forecastable", sa.Boolean(), nullable=False),
        sa.Column("remaining_units", sa.Integer(), nullable=False),
        sa.Column("confidence", sa.String(length=20), nullable=False),
        sa.Column("data_quality", sa.String(length=20), nullable=False),
        sa.Column("p50_periods", sa.Integer(), nullable=True),
        sa.Column("p85_periods", sa.Integer(), nullable=True),
        sa.Column("p95_periods", sa.Integer(), nullable=True),
        sa.Column("p50_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("p85_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("p95_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("inputs", postgresql.JSONB(none_as_null=True), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_forecast_snapshots_project_id", "forecast_snapshots", ["project_id"]
    )
    op.create_index(
        "ix_forecast_snapshots_calculated_at", "forecast_snapshots", ["calculated_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_forecast_snapshots_calculated_at", table_name="forecast_snapshots")
    op.drop_index("ix_forecast_snapshots_project_id", table_name="forecast_snapshots")
    op.drop_table("forecast_snapshots")
