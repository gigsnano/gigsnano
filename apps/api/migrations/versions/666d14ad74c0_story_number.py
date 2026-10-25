"""story_number

Revision ID: 666d14ad74c0
Revises: a3b4c5d6e7f8
Create Date: 2026-07-07 06:54:15.803959

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '666d14ad74c0'
down_revision: Union[str, Sequence[str], None] = 'a3b4c5d6e7f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("stories", sa.Column("story_number", sa.Integer(), nullable=True))
    # Backfill: number existing rows per project in creation order.
    op.execute(
        """
        WITH numbered AS (
            SELECT id, ROW_NUMBER() OVER (
                PARTITION BY project_id ORDER BY created_at, id
            ) AS n
            FROM stories
        )
        UPDATE stories SET story_number = numbered.n
        FROM numbered WHERE stories.id = numbered.id
        """
    )
    op.create_unique_constraint(
        "uq_stories_project_number", "stories", ["project_id", "story_number"]
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("uq_stories_project_number", "stories", type_="unique")
    op.drop_column("stories", "story_number")
