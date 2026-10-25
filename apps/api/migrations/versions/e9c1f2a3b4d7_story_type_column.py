"""add stories.type (work-item type) column

Revision ID: e9c1f2a3b4d7
Revises: d8e2f3a4b5c6
Create Date: 2026-07-05

Additive + backward-compatible: creates the `story_type` enum and adds a
NOT NULL `stories.type` column with server default 'story', so every existing
row backfills to Story. Frontend reads it via storyTypeOf() (optional on the
wire), so old clients are unaffected.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "e9c1f2a3b4d7"
down_revision: Union[str, Sequence[str], None] = "d8e2f3a4b5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


STORY_TYPE = postgresql.ENUM(
    "epic", "feature", "story", "task", "bug", name="story_type"
)


def upgrade() -> None:
    # Create the enum type first so the add_column can reference it (create_type=False).
    STORY_TYPE.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "stories",
        sa.Column(
            "type",
            sa.Enum(
                "epic", "feature", "story", "task", "bug",
                name="story_type", create_type=False,
            ),
            nullable=False,
            server_default="story",
        ),
    )


def downgrade() -> None:
    op.drop_column("stories", "type")
    op.execute("DROP TYPE IF EXISTS story_type")
