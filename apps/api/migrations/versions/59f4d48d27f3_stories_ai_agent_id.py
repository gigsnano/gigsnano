"""stories ai_agent_id

Revision ID: 59f4d48d27f3
Revises: 95c8fc1aea15
Create Date: 2026-07-04 19:06:42.589376

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '59f4d48d27f3'
down_revision: Union[str, Sequence[str], None] = '95c8fc1aea15'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("stories", sa.Column("ai_agent_id", sa.String(length=40), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("stories", "ai_agent_id")
