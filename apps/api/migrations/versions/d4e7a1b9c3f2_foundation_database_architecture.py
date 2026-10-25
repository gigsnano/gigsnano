"""foundation database + architecture (GIN-225 granular composer)

Revision ID: d4e7a1b9c3f2
Revises: 9c4230dc17cc
Create Date: 2026-07-17 18:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4e7a1b9c3f2'
down_revision: Union[str, Sequence[str], None] = '9c4230dc17cc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # server_default='' backfills existing locked foundations so the NOT NULL holds.
    op.add_column(
        'project_foundations',
        sa.Column('database', sa.String(length=50), nullable=False, server_default=''),
    )
    op.add_column(
        'project_foundations',
        sa.Column('architecture', sa.String(length=50), nullable=False, server_default=''),
    )


def downgrade() -> None:
    op.drop_column('project_foundations', 'architecture')
    op.drop_column('project_foundations', 'database')
