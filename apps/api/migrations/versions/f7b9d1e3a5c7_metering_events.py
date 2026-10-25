"""metering events (GIN-235)

Revision ID: f7b9d1e3a5c7
Revises: e6a8c0d2f4b6
Create Date: 2026-07-18 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'f7b9d1e3a5c7'
down_revision: Union[str, Sequence[str], None] = 'e6a8c0d2f4b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'metering_events',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('workspace_id', sa.String(length=36), nullable=False),
        sa.Column('key', sa.String(length=40), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_metering_events_ws_key_created', 'metering_events',
        ['workspace_id', 'key', 'created_at'],
    )


def downgrade() -> None:
    op.drop_index('ix_metering_events_ws_key_created', table_name='metering_events')
    op.drop_table('metering_events')
