"""GIN-300: canonical content JSON columns alongside the existing HTML columns.

Purely additive and fully reversible. Every column is nullable with no default, so
existing rows are untouched and every current read path behaves identically —
nothing reads these until `content_json_read` is enabled.

NULL means "no canonical copy yet", which is the correct steady state for
editor-authored HTML until GIN-308 backfills it, not an error. The HTML columns
stay authoritative and are NOT dropped by GIN-297; retiring them is a separate
decision after a full retention window (ADR 0001 section 9).

Revision ID: f3c8b1a94d27
Revises: ec4f7a9b2d10
Create Date: 2026-07-20
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "f3c8b1a94d27"
down_revision = "ec4f7a9b2d10"
branch_labels = None
depends_on = None


# (table, existing HTML column, new canonical column)
_FIELDS = [
    ("stories", "description", "description_json"),
    ("story_comments", "body", "body_json"),
    ("projects", "overview", "overview_json"),
]


def upgrade() -> None:
    for table, _, json_column in _FIELDS:
        op.add_column(table, sa.Column(json_column, postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    for table, _, json_column in _FIELDS:
        op.drop_column(table, json_column)
