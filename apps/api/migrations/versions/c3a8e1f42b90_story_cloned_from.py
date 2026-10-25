"""GIN-355: stories.cloned_from_id — duplication source traceability.

Revision ID: c3a8e1f42b90
Revises: b2f9c7d31a48
Create Date: 2026-07-21
"""

import sqlalchemy as sa
from alembic import op

revision = "c3a8e1f42b90"
down_revision = "b2f9c7d31a48"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "stories",
        sa.Column("cloned_from_id", sa.String(length=36), nullable=True),
    )
    op.create_foreign_key(
        "fk_stories_cloned_from_id",
        "stories",
        "stories",
        ["cloned_from_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_stories_cloned_from_id", "stories", ["cloned_from_id"])


def downgrade() -> None:
    op.drop_index("ix_stories_cloned_from_id", table_name="stories")
    op.drop_constraint("fk_stories_cloned_from_id", "stories", type_="foreignkey")
    op.drop_column("stories", "cloned_from_id")
