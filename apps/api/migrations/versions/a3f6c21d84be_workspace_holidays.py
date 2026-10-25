"""workspace holidays

Non-working days per workspace, so charts (and later, scheduling) can tell a
quiet Tuesday from a public holiday.

A JSON column rather than a table: the list is small, bounded by the year, and
every reader wants the whole calendar rather than one row of it.

Revision ID: a3f6c21d84be
Revises: f2a7c4e9b118
"""

import sqlalchemy as sa
from alembic import op

revision = "a3f6c21d84be"
down_revision = "f2a7c4e9b118"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # server_default so rows written before this deploy read as an empty
    # calendar rather than NULL — the API tolerates NULL, but a backfill here
    # means nothing downstream has to.
    op.add_column(
        "workspaces",
        sa.Column(
            "holidays",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'"),
        ),
    )


def downgrade() -> None:
    op.drop_column("workspaces", "holidays")
