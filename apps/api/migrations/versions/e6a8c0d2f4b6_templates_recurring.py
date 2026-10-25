"""templates + recurrence columns (GIN-239/240/241)

Revision ID: e6a8c0d2f4b6
Revises: d5f7b9c1e3a5
Create Date: 2026-07-18 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'e6a8c0d2f4b6'
down_revision: Union[str, Sequence[str], None] = 'd5f7b9c1e3a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE llm_usage_source ADD VALUE IF NOT EXISTS 'template'")

    op.create_table(
        'templates',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('workspace_id', sa.String(length=36), nullable=False),
        sa.Column('kind', sa.String(length=20), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('visibility', sa.String(length=10), nullable=False, server_default='private'),
        sa.Column('content', sa.JSON(), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('created_by_id', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_templates_workspace_id'), 'templates', ['workspace_id'])

    op.add_column('automation_rules', sa.Column('schedule', sa.JSON(), nullable=True))
    op.add_column('automation_rules', sa.Column('next_run_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('automation_rules', 'next_run_at')
    op.drop_column('automation_rules', 'schedule')
    op.drop_index(op.f('ix_templates_workspace_id'), table_name='templates')
    op.drop_table('templates')
    # llm_usage_source 'template' value is left in place (PG can't drop enum values).
