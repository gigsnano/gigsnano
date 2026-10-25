"""stories soft delete: deleted_at + deleted_by_id (GIN-97).

Revision ID: b8f2a1c7d4e9
Revises: a7c1e93f2b8d
Create Date: 2026-07-16
"""

import sqlalchemy as sa
from alembic import op

revision = "b8f2a1c7d4e9"
down_revision = "a7c1e93f2b8d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "stories", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "stories", sa.Column("deleted_by_id", sa.String(length=36), nullable=True)
    )
    op.create_index(op.f("ix_stories_deleted_at"), "stories", ["deleted_at"])
    op.create_foreign_key(
        "fk_stories_deleted_by_id_users",
        "stories",
        "users",
        ["deleted_by_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_stories_deleted_by_id_users", "stories", type_="foreignkey")
    op.drop_index(op.f("ix_stories_deleted_at"), table_name="stories")
    op.drop_column("stories", "deleted_by_id")
    op.drop_column("stories", "deleted_at")
