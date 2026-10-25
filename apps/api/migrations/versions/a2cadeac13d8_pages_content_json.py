"""GIN-300: nullable pages.content_json for TipTap canonical content.

Purely additive and fully reversible. The column is nullable with no default, so
existing rows are untouched and every current read path behaves identically.

Revision ID: a2cadeac13d8
Revises: b8c2e4f70a15
Create Date: 2026-07-26
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "a2cadeac13d8"
down_revision = "b8c2e4f70a15"
branch_labels = None
depends_on = None

_JSON = sa.JSON(none_as_null=True).with_variant(
    postgresql.JSONB(none_as_null=True), "postgresql"
)


def upgrade() -> None:
    op.add_column("pages", sa.Column("content_json", _JSON, nullable=True))


def downgrade() -> None:
    op.drop_column("pages", "content_json")
