"""index story_activities for date-range aggregation (GIN-161)

The daily activity chart scans story_activities by (field, created_at) across a
whole workspace. The table only had an index on story_id -- fine for "this item's
history", useless for "every status change in July", which seq-scans and grows
with total activity forever.

(field, created_at) matches the query's shape: field is the equality predicate,
created_at the range, so one btree serves both. The date filter is a half-open
range on the raw column (not date(created_at)), which keeps it sargable.

CONCURRENTLY so it doesn't take a write lock on a live table -- which is also why
this migration cannot run inside a transaction.

Revision ID: a4c6e8b0d2f1
Revises: f3a9c2b7e14d
"""

from alembic import op

revision = "a4c6e8b0d2f1"
down_revision = "f3a9c2b7e14d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # CREATE INDEX CONCURRENTLY cannot run in a transaction block; alembic opens
    # one by default, so commit it first.
    op.execute("COMMIT")
    op.execute(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_story_activities_field_created_at "
        "ON story_activities (field, created_at)"
    )


def downgrade() -> None:
    op.execute("COMMIT")
    op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_story_activities_field_created_at")
