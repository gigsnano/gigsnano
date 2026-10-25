"""llm usage source: agent_run (GIN-250)

Revision ID: a2c4e6f8b1d3
Revises: f1a3b5c7d9e2
Create Date: 2026-07-18 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = 'a2c4e6f8b1d3'
down_revision: Union[str, Sequence[str], None] = 'f1a3b5c7d9e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # PG 12+ allows ADD VALUE inside a transaction as long as it isn't used in the
    # same one (we don't). Not consumed here — only by app writes after commit.
    op.execute("ALTER TYPE llm_usage_source ADD VALUE IF NOT EXISTS 'agent_run'")


def downgrade() -> None:
    # Postgres cannot drop an enum value; leaving it is harmless (no rows reference
    # it after a downgrade). No-op by design.
    pass
