"""smart intake: customers + triage_items (GIN-213/214)

Revision ID: b3d5f7a9c2e4
Revises: a2c4e6f8b1d3
Create Date: 2026-07-18 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'b3d5f7a9c2e4'
down_revision: Union[str, Sequence[str], None] = 'a2c4e6f8b1d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_source = sa.Enum('personal', 'in_app', 'public_form', 'email', 'customer', name='triage_source')
_tstatus = sa.Enum('new', 'triaged', 'accepted', 'dismissed', name='triage_status')


def upgrade() -> None:
    op.execute("ALTER TYPE llm_usage_source ADD VALUE IF NOT EXISTS 'intake'")

    op.create_table(
        'customers',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('workspace_id', sa.String(length=36), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('email', sa.String(length=320), nullable=True),
        sa.Column('priority_weight', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by_id', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='SET NULL'),
    )
    op.create_index(op.f('ix_customers_workspace_id'), 'customers', ['workspace_id'])

    op.create_table(
        'triage_items',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('workspace_id', sa.String(length=36), nullable=False),
        sa.Column('project_id', sa.String(length=36), nullable=True),
        sa.Column('source', _source, nullable=False),
        sa.Column('is_public', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('title', sa.String(length=300), nullable=False),
        sa.Column('body', sa.Text(), nullable=False, server_default=''),
        sa.Column('customer_id', sa.String(length=36), nullable=True),
        sa.Column('created_by_id', sa.String(length=36), nullable=True),
        sa.Column('status', _tstatus, nullable=False, server_default='new'),
        sa.Column('classification', sa.JSON(), nullable=False),
        sa.Column('enriched_title', sa.String(length=300), nullable=True),
        sa.Column('enriched_description', sa.Text(), nullable=True),
        sa.Column('priority', sa.String(length=10), nullable=True),
        sa.Column('duplicate_ids', sa.JSON(), nullable=False),
        sa.Column('recommended_route', sa.JSON(), nullable=False),
        sa.Column('created_story_id', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['created_story_id'], ['stories.id'], ondelete='SET NULL'),
    )
    op.create_index(op.f('ix_triage_items_workspace_id'), 'triage_items', ['workspace_id'])
    op.create_index(op.f('ix_triage_items_status'), 'triage_items', ['status'])


def downgrade() -> None:
    op.drop_index(op.f('ix_triage_items_status'), table_name='triage_items')
    op.drop_index(op.f('ix_triage_items_workspace_id'), table_name='triage_items')
    op.drop_table('triage_items')
    op.drop_index(op.f('ix_customers_workspace_id'), table_name='customers')
    op.drop_table('customers')
    bind = op.get_bind()
    _tstatus.drop(bind, checkfirst=True)
    _source.drop(bind, checkfirst=True)
    # llm_usage_source 'intake' value is left in place (PG can't drop enum values).
