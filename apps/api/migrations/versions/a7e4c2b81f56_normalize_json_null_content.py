"""GIN-305: normalize JSON `null` to SQL NULL in the canonical content columns.

SQLAlchemy stores Python `None` into a JSON column as the JSON value `null`
unless the type sets `none_as_null=True`. The two read back identically in Python
but are opposites in SQL: `col IS NOT NULL` is TRUE for a JSON null.

That made rollout coverage over-report (un-canonicalised rows counted as covered)
and made the backfill's `WHERE col IS NULL` skip those rows permanently. The type
now sets `none_as_null=True`; this cleans up the rows written before it did.

Idempotent, and safe to re-run. No downgrade: turning SQL NULL back into JSON null
would restore a bug, not a state anyone wants.

Revision ID: a7e4c2b81f56
Revises: f3c8b1a94d27
Create Date: 2026-07-20
"""

from alembic import op

revision = "a7e4c2b81f56"
down_revision = "f3c8b1a94d27"
branch_labels = None
depends_on = None

_COLUMNS = [
    ("stories", "description_json"),
    ("story_comments", "body_json"),
    ("projects", "overview_json"),
]


def upgrade() -> None:
    for table, column in _COLUMNS:
        op.execute(
            f"UPDATE {table} SET {column} = NULL WHERE {column} = 'null'::jsonb"  # noqa: S608
        )


def downgrade() -> None:
    # Intentionally a no-op: SQL NULL is the correct representation, and
    # re-introducing JSON nulls would only restore the bug.
    pass
