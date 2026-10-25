"""nl automations: automation_rules + automation_runs (GIN-252/253/254)

Revision ID: d5f7b9c1e3a5
Revises: c4e6a8b0d2f6
Create Date: 2026-07-18 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'd5f7b9c1e3a5'
down_revision: Union[str, Sequence[str], None] = 'c4e6a8b0d2f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE llm_usage_source ADD VALUE IF NOT EXISTS 'automation'")

    op.create_table(
        'automation_rules',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('project_id', sa.String(length=36), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('source_text', sa.Text(), nullable=False, server_default=''),
        sa.Column('trigger_event', sa.String(length=40), nullable=False),
        sa.Column('ast', sa.JSON(), nullable=False),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_automation_rules_project_id'), 'automation_rules', ['project_id'])

    op.create_table(
        'automation_runs',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('automation_id', sa.String(length=36), nullable=True),
        sa.Column('project_id', sa.String(length=36), nullable=False),
        sa.Column('trigger_event', sa.String(length=40), nullable=False),
        sa.Column('story_id', sa.String(length=36), nullable=True),
        sa.Column('dry_run', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='matched'),
        sa.Column('actions_taken', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['automation_id'], ['automation_rules.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['story_id'], ['stories.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_automation_runs_project_id'), 'automation_runs', ['project_id'])


def downgrade() -> None:
    op.drop_index(op.f('ix_automation_runs_project_id'), table_name='automation_runs')
    op.drop_table('automation_runs')
    op.drop_index(op.f('ix_automation_rules_project_id'), table_name='automation_rules')
    op.drop_table('automation_rules')
    # llm_usage_source 'automation' value is left in place (PG can't drop enum values).
