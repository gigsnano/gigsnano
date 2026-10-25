"""GIN-368: idempotency_records — retry-safe agent mutations.

Revision ID: b2f9c7d31a48
Revises: a7e4c2b81f56
Create Date: 2026-07-21
"""

import sqlalchemy as sa
from alembic import op

revision = "b2f9c7d31a48"
down_revision = "a7e4c2b81f56"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "idempotency_records",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "workspace_id",
            sa.String(length=36),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("idem_key", sa.String(length=200), nullable=False),
        sa.Column("fingerprint", sa.String(length=64), nullable=False),
        sa.Column("response_json", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.UniqueConstraint(
            "user_id", "workspace_id", "idem_key", name="uq_idempotency_scope_key"
        ),
    )
    op.create_index(
        "ix_idempotency_records_user_id", "idempotency_records", ["user_id"]
    )
    op.create_index(
        "ix_idempotency_records_workspace_id", "idempotency_records", ["workspace_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_idempotency_records_workspace_id", table_name="idempotency_records")
    op.drop_index("ix_idempotency_records_user_id", table_name="idempotency_records")
    op.drop_table("idempotency_records")
