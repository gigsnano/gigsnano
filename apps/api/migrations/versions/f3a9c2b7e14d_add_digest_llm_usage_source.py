"""add 'digest' to llm_usage_source (GIN-147)

The daily digest's AI focus note is a real, paid LLM call that ran unrecorded --
`digests/` never called record_llm_usage, so its cost was invisible in the admin
dashboard. Recording it needs a source of its own: calling it `gigs_ai` would be a
lie, and lying in the usage table is how the cost got lost in the first place.

Additive only. ALTER TYPE ... ADD VALUE writes no rows and rewrites no table, so
there is nothing to undo -- and Postgres cannot DROP a value from an enum, hence the
no-op downgrade.

Revision ID: f3a9c2b7e14d
Revises: e2b8d4f1a6c3
"""

from alembic import op

revision = "f3a9c2b7e14d"
down_revision = "e2b8d4f1a6c3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # IF NOT EXISTS so a re-run (or a DB that already has it) is a no-op rather than
    # a failed migration.
    op.execute("ALTER TYPE llm_usage_source ADD VALUE IF NOT EXISTS 'digest'")


def downgrade() -> None:
    # Postgres has no ALTER TYPE ... DROP VALUE. Removing it would mean recreating the
    # type and rewriting every dependent column -- far more dangerous than leaving an
    # unused label behind.
    pass
