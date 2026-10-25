"""foundation version history + pending proposed change (GIN-196)

Revision ID: c2e4f6a8b0d1
Revises: b0d2f4a6c8e0
Create Date: 2026-07-18 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'c2e4f6a8b0d1'
down_revision: Union[str, Sequence[str], None] = 'b0d2f4a6c8e0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'project_foundations',
        sa.Column('history', sa.JSON(), nullable=False, server_default='[]'),
    )
    op.add_column(
        'project_foundations',
        sa.Column('pending_change', sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('project_foundations', 'pending_change')
    op.drop_column('project_foundations', 'history')
