"""GIN-526: invitation lifecycle states, expiry, and hashed accept tokens.

Three changes to `workspace_invitations`:

1. **The raw token becomes a SHA-256 hash.** Existing tokens are hashed in place
   rather than discarded, so invitations already sitting in someone's inbox keep
   working across the deploy — dropping and re-adding the column would silently
   void every outstanding invitation.
2. **Explicit lifecycle** (`status`, `expires_at`, `accepted_at`, `last_sent_at`,
   `resend_count`). Rows are now retained after they settle, which is what lets
   the Invitations screen show history.
3. **Uniqueness becomes partial.** The old UNIQUE(workspace_id, email) allowed
   exactly one row per address ever; with settled rows retained, the constraint
   must apply only to PENDING ones.

Existing rows are all treated as pending and given a full expiry window from the
deploy, not from their original creation date: an invitation sent last month
would otherwise arrive already expired for a recipient who never had a chance to
use it under the old, expiry-free rules.

Revision ID: f2a7c4e9b118
Revises: 7d1634bd7228
Create Date: 2026-07-31
"""

import hashlib
from datetime import UTC, datetime, timedelta

import sqlalchemy as sa
from alembic import op

revision = "f2a7c4e9b118"
down_revision = "7d1634bd7228"
branch_labels = None
depends_on = None

_TABLE = "workspace_invitations"
_ENUM = sa.Enum(
    "pending", "accepted", "expired", "revoked", "delivery_failed", name="invitation_status"
)
_TTL_DAYS = 7


def upgrade() -> None:
    bind = op.get_bind()
    _ENUM.create(bind, checkfirst=True)

    op.add_column(_TABLE, sa.Column("token_hash", sa.String(length=64), nullable=True))
    op.add_column(
        _TABLE, sa.Column("status", _ENUM, nullable=False, server_default="pending")
    )
    op.add_column(_TABLE, sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(_TABLE, sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(_TABLE, sa.Column("last_sent_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        _TABLE, sa.Column("resend_count", sa.Integer(), nullable=False, server_default="0")
    )

    # Hash the tokens that are already out in the world. Done row by row because
    # no database ships a portable SHA-256 over an arbitrary text column, and the
    # table is small (one row per outstanding invitation).
    rows = bind.execute(sa.text(f"SELECT id, token FROM {_TABLE}")).fetchall()
    for row_id, token in rows:
        bind.execute(
            sa.text(f"UPDATE {_TABLE} SET token_hash = :h WHERE id = :i"),
            {"h": hashlib.sha256(token.encode()).hexdigest(), "i": row_id},
        )
    bind.execute(
        sa.text(f"UPDATE {_TABLE} SET expires_at = :e WHERE expires_at IS NULL"),
        {"e": datetime.now(UTC) + timedelta(days=_TTL_DAYS)},
    )

    op.alter_column(_TABLE, "token_hash", nullable=False)
    op.alter_column(_TABLE, "expires_at", nullable=False)
    # Defaults existed only to backfill; the ORM owns these values from here.
    op.alter_column(_TABLE, "status", server_default=None)
    op.alter_column(_TABLE, "resend_count", server_default=None)

    op.create_index(f"ix_{_TABLE}_token_hash", _TABLE, ["token_hash"], unique=True)
    op.create_index(f"ix_{_TABLE}_status", _TABLE, ["status"])

    # The old constraint's name was assigned by the database (the model declared
    # it without one), so drop it by its PostgreSQL default spelling and tolerate
    # its absence rather than failing the deploy on a name mismatch.
    if bind.dialect.name == "postgresql":
        op.execute(
            f"ALTER TABLE {_TABLE} DROP CONSTRAINT IF EXISTS "
            f"{_TABLE}_workspace_id_email_key"
        )

    op.drop_index(f"ix_{_TABLE}_token", table_name=_TABLE, if_exists=True)
    op.drop_column(_TABLE, "token")

    op.create_index(
        "uq_invitation_ws_email_pending",
        _TABLE,
        ["workspace_id", "email"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
        sqlite_where=sa.text("status = 'pending'"),
    )


def downgrade() -> None:
    """Reverses the schema. **This one loses data, by necessity.**

    Two things cannot survive the trip back:

    1. The raw tokens are gone (only hashes were kept), so every outstanding
       invitation becomes unredeemable. Recipients must be re-invited.
    2. The old schema allowed exactly one row per (workspace, email), while the
       new one deliberately keeps settled rows as history. The surplus rows are
       deleted here, newest kept — restoring the constraint is impossible
       otherwise, which a live rollback proved rather than theory.

    Roll back only if the feature must be pulled; it is not a free undo.
    """
    bind = op.get_bind()
    op.drop_index("uq_invitation_ws_email_pending", table_name=_TABLE)

    # Collapse retained history to the single row the old constraint permits.
    bind.execute(
        sa.text(
            f"DELETE FROM {_TABLE} a USING {_TABLE} b "
            "WHERE a.workspace_id = b.workspace_id AND a.email = b.email "
            "AND (a.created_at, a.id) < (b.created_at, b.id)"
        )
        if bind.dialect.name == "postgresql"
        else sa.text(
            f"DELETE FROM {_TABLE} WHERE id NOT IN ("
            f"  SELECT id FROM {_TABLE} GROUP BY workspace_id, email"
            "   HAVING created_at = MAX(created_at))"
        )
    )
    op.add_column(_TABLE, sa.Column("token", sa.String(length=64), nullable=True))
    # No raw token survives the hash, so give each row a distinct placeholder to
    # satisfy the unique index rather than colliding every row on one value.
    rows = bind.execute(sa.text(f"SELECT id FROM {_TABLE}")).fetchall()
    for (row_id,) in rows:
        bind.execute(
            sa.text(f"UPDATE {_TABLE} SET token = :t WHERE id = :i"),
            {"t": f"revoked-{row_id}"[:64], "i": row_id},
        )
    op.alter_column(_TABLE, "token", nullable=False)
    op.create_index(f"ix_{_TABLE}_token", _TABLE, ["token"], unique=True)

    op.drop_index(f"ix_{_TABLE}_status", table_name=_TABLE)
    op.drop_index(f"ix_{_TABLE}_token_hash", table_name=_TABLE)
    op.drop_column(_TABLE, "resend_count")
    op.drop_column(_TABLE, "last_sent_at")
    op.drop_column(_TABLE, "accepted_at")
    op.drop_column(_TABLE, "expires_at")
    op.drop_column(_TABLE, "status")
    op.drop_column(_TABLE, "token_hash")
    if bind.dialect.name == "postgresql":
        op.create_unique_constraint(
            f"{_TABLE}_workspace_id_email_key", _TABLE, ["workspace_id", "email"]
        )
    _ENUM.drop(bind, checkfirst=True)
