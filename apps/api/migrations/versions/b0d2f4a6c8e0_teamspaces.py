"""teamspaces + members + projects (GIN-245)

Revision ID: b0d2f4a6c8e0
Revises: a8c0e2f4b6d8
Create Date: 2026-07-18 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'b0d2f4a6c8e0'
down_revision: Union[str, Sequence[str], None] = 'a8c0e2f4b6d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _ts():
    return [
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        'teamspaces',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('workspace_id', sa.String(length=36), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('description', sa.Text(), nullable=False, server_default=''),
        sa.Column('pinned_artifacts', sa.JSON(), nullable=False),
        *_ts(),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_teamspaces_workspace_id'), 'teamspaces', ['workspace_id'])

    op.create_table(
        'teamspace_members',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('teamspace_id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        *_ts(),
        sa.ForeignKeyConstraint(['teamspace_id'], ['teamspaces.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('teamspace_id', 'user_id'),
    )
    op.create_index(op.f('ix_teamspace_members_teamspace_id'), 'teamspace_members', ['teamspace_id'])
    op.create_index(op.f('ix_teamspace_members_user_id'), 'teamspace_members', ['user_id'])

    op.create_table(
        'teamspace_projects',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('teamspace_id', sa.String(length=36), nullable=False),
        sa.Column('project_id', sa.String(length=36), nullable=False),
        *_ts(),
        sa.ForeignKeyConstraint(['teamspace_id'], ['teamspaces.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('teamspace_id', 'project_id'),
    )
    op.create_index(op.f('ix_teamspace_projects_teamspace_id'), 'teamspace_projects', ['teamspace_id'])
    op.create_index(op.f('ix_teamspace_projects_project_id'), 'teamspace_projects', ['project_id'])


def downgrade() -> None:
    op.drop_table('teamspace_projects')
    op.drop_table('teamspace_members')
    op.drop_index(op.f('ix_teamspaces_workspace_id'), table_name='teamspaces')
    op.drop_table('teamspaces')
