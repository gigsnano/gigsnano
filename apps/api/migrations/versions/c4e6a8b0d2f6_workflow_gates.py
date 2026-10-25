"""workflow rules + gate decisions (GIN-220)

Revision ID: c4e6a8b0d2f6
Revises: b3d5f7a9c2e4
Create Date: 2026-07-18 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'c4e6a8b0d2f6'
down_revision: Union[str, Sequence[str], None] = 'b3d5f7a9c2e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE llm_usage_source ADD VALUE IF NOT EXISTS 'gate'")

    op.create_table(
        'workflow_rules',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('project_id', sa.String(length=36), nullable=False),
        sa.Column('from_status', sa.String(length=20), nullable=False, server_default=''),
        sa.Column('to_status', sa.String(length=20), nullable=False),
        sa.Column('approver_kind', sa.String(length=10), nullable=False),
        sa.Column('approver_ref', sa.String(length=40), nullable=False),
        sa.Column('on_concerns', sa.String(length=10), nullable=False, server_default='block'),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_workflow_rules_project_id'), 'workflow_rules', ['project_id'])

    op.create_table(
        'gate_decisions',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('story_id', sa.String(length=36), nullable=False),
        sa.Column('rule_id', sa.String(length=36), nullable=True),
        sa.Column('from_status', sa.String(length=20), nullable=False),
        sa.Column('to_status', sa.String(length=20), nullable=False),
        sa.Column('approver_kind', sa.String(length=10), nullable=False),
        sa.Column('approver_ref', sa.String(length=40), nullable=False),
        sa.Column('verdict', sa.String(length=10), nullable=False),
        sa.Column('allowed', sa.Boolean(), nullable=False),
        sa.Column('rationale', sa.Text(), nullable=False, server_default=''),
        sa.Column('actor_id', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['story_id'], ['stories.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['rule_id'], ['workflow_rules.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['actor_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_gate_decisions_story_id'), 'gate_decisions', ['story_id'])


def downgrade() -> None:
    op.drop_index(op.f('ix_gate_decisions_story_id'), table_name='gate_decisions')
    op.drop_table('gate_decisions')
    op.drop_index(op.f('ix_workflow_rules_project_id'), table_name='workflow_rules')
    op.drop_table('workflow_rules')
    # llm_usage_source 'gate' value is left in place (PG can't drop enum values).
