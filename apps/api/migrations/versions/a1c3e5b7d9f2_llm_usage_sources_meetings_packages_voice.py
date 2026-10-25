"""add meeting_notes, package_import, voice to llm_usage_source

Meeting notes, document-package analysis and voice turns called the LLM without
recording usage, so their cost was invisible and never charged on the hosted
service. Each gets its own source so the usage table stays honest.

Additive only (see f3a9c2b7e14d for why the downgrade is a no-op).

Revision ID: a1c3e5b7d9f2
Revises: f7a2c9e41d05
"""

from alembic import op

revision = "a1c3e5b7d9f2"
down_revision = "f7a2c9e41d05"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for value in ("meeting_notes", "package_import", "voice"):
        op.execute(f"ALTER TYPE llm_usage_source ADD VALUE IF NOT EXISTS '{value}'")


def downgrade() -> None:
    pass
