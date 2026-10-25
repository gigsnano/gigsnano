"""digest timing: per-user timezone, hour, weekdays (GIN-124).

Adds `timezone` / `digest_hour` / `digest_weekdays` and retires the
`frequency` + `weekly_day` pair, which encoded "which days" twice and could
disagree. `digest_weekdays` becomes the single source of truth: daily = all
seven days, weekly = one.

Revision ID: d1a7c3e9f5b2
Revises: pp17planprice
Create Date: 2026-07-16
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "d1a7c3e9f5b2"
down_revision = "pp17planprice"
branch_labels = None
depends_on = None

_ALL_DAYS = "[0, 1, 2, 3, 4, 5, 6]"
_FREQ = postgresql.ENUM("daily", "weekly", name="digest_frequency", create_type=False)


def upgrade() -> None:
    op.add_column(
        "digest_preferences",
        sa.Column("timezone", sa.String(length=64), nullable=False, server_default="UTC"),
    )
    op.add_column(
        "digest_preferences",
        sa.Column("digest_hour", sa.Integer(), nullable=False, server_default="8"),
    )
    op.add_column(
        "digest_preferences",
        sa.Column(
            "digest_weekdays",
            sa.JSON(),
            nullable=False,
            server_default=sa.text(f"'{_ALL_DAYS}'::json"),
        ),
    )
    # Backfill from the retired pair before dropping it: weekly ⇒ that one day,
    # daily ⇒ every day. Runs after add_column, so it overwrites the default.
    op.execute(
        """
        UPDATE digest_preferences
           SET digest_weekdays = CASE
                 WHEN frequency = 'weekly' THEN json_build_array(weekly_day)
                 ELSE '[0, 1, 2, 3, 4, 5, 6]'::json
               END
        """
    )
    op.drop_column("digest_preferences", "frequency")
    op.drop_column("digest_preferences", "weekly_day")
    _FREQ.drop(op.get_bind(), checkfirst=True)


def downgrade() -> None:
    _FREQ.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "digest_preferences",
        sa.Column("frequency", _FREQ, nullable=False, server_default="daily"),
    )
    op.add_column(
        "digest_preferences",
        sa.Column("weekly_day", sa.Integer(), nullable=False, server_default="0"),
    )
    # Lossy by nature: a custom multi-day set (e.g. Mon/Wed/Fri) has no
    # representation in frequency+weekly_day, so anything that isn't exactly one
    # day collapses back to daily.
    op.execute(
        """
        UPDATE digest_preferences
           SET frequency = CASE
                 WHEN json_array_length(digest_weekdays) = 1 THEN 'weekly'::digest_frequency
                 ELSE 'daily'::digest_frequency
               END,
               weekly_day = CASE
                 WHEN json_array_length(digest_weekdays) = 1
                   THEN (digest_weekdays->>0)::int
                 ELSE 0
               END
        """
    )
    op.drop_column("digest_preferences", "digest_weekdays")
    op.drop_column("digest_preferences", "digest_hour")
    op.drop_column("digest_preferences", "timezone")
