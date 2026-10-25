"""GIN-330: project planning method (Automatic default).

Adds `planning_method` (default 'automatic') + `planning_method_updated_at`. All
existing projects become Automatic — there is no prior per-project estimate-mode
concept to detect, so nothing is ambiguous and no migration report is needed.

Revision ID: c7d1e9a4b6f2
Revises: b4e2f8a1c9d7
Create Date: 2026-07-21
"""

import sqlalchemy as sa
from alembic import op

revision = "c7d1e9a4b6f2"
down_revision = "b4e2f8a1c9d7"
branch_labels = None
depends_on = None

_ENUM = sa.Enum("automatic", "simple", "points", "time", name="planning_method")


def upgrade() -> None:
    _ENUM.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "projects",
        sa.Column(
            "planning_method",
            _ENUM,
            nullable=False,
            server_default="automatic",
        ),
    )
    op.add_column(
        "projects",
        sa.Column("planning_method_updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Drop the server_default now that existing rows are backfilled — the ORM sets it.
    op.alter_column("projects", "planning_method", server_default=None)


def downgrade() -> None:
    op.drop_column("projects", "planning_method_updated_at")
    op.drop_column("projects", "planning_method")
    _ENUM.drop(op.get_bind(), checkfirst=True)
