"""agent runs + steps (GIN-249)

Revision ID: f1a3b5c7d9e2
Revises: e5f8c2a4d6b1
Create Date: 2026-07-17 19:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f1a3b5c7d9e2'
down_revision: Union[str, Sequence[str], None] = 'e5f8c2a4d6b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_autonomy = sa.Enum('suggest', 'draft', 'autopilot', name='agent_autonomy')
_state = sa.Enum('queued', 'planning', 'executing', 'awaiting_review', 'done', 'failed', 'stopped',
                 name='agent_run_state')
_kind = sa.Enum('plan', 'tool', 'artifact', 'pr', 'note', name='agent_run_step_kind')


def upgrade() -> None:
    op.create_table(
        'agent_runs',
        sa.Column('story_id', sa.String(length=36), nullable=False),
        sa.Column('persona_id', sa.String(length=40), nullable=False),
        sa.Column('autonomy', _autonomy, nullable=False),
        sa.Column('state', _state, nullable=False),
        sa.Column('cost_tokens', sa.Integer(), nullable=False),
        sa.Column('cost_usd', sa.Numeric(precision=12, scale=6), nullable=False),
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['story_id'], ['stories.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_agent_runs_story_id'), 'agent_runs', ['story_id'])
    op.create_index(op.f('ix_agent_runs_state'), 'agent_runs', ['state'])
    op.create_table(
        'agent_run_steps',
        sa.Column('run_id', sa.String(length=36), nullable=False),
        sa.Column('seq', sa.Integer(), nullable=False),
        sa.Column('kind', _kind, nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('summary', sa.String(length=500), nullable=False),
        sa.Column('payload', sa.JSON(), nullable=False),
        sa.Column('tokens', sa.Integer(), nullable=False),
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['run_id'], ['agent_runs.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_agent_run_steps_run_id'), 'agent_run_steps', ['run_id'])


def downgrade() -> None:
    op.drop_index(op.f('ix_agent_run_steps_run_id'), table_name='agent_run_steps')
    op.drop_table('agent_run_steps')
    op.drop_index(op.f('ix_agent_runs_state'), table_name='agent_runs')
    op.drop_index(op.f('ix_agent_runs_story_id'), table_name='agent_runs')
    op.drop_table('agent_runs')
    bind = op.get_bind()
    _kind.drop(bind, checkfirst=True)
    _state.drop(bind, checkfirst=True)
    _autonomy.drop(bind, checkfirst=True)
