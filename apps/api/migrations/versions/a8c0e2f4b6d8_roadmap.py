"""roadmap: initiatives + milestones + releases (GIN-206)

Revision ID: a8c0e2f4b6d8
Revises: f7b9d1e3a5c7
Create Date: 2026-07-18 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'a8c0e2f4b6d8'
down_revision: Union[str, Sequence[str], None] = 'f7b9d1e3a5c7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _cols():
    return [
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    ]


def upgrade() -> None:
    op.execute("ALTER TYPE llm_usage_source ADD VALUE IF NOT EXISTS 'roadmap'")

    op.create_table(
        'initiatives',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('workspace_id', sa.String(length=36), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text(), nullable=False, server_default=''),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='planned'),
        sa.Column('lead_id', sa.String(length=36), nullable=True),
        sa.Column('target_date', sa.Date(), nullable=True),
        *_cols(),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['lead_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_initiatives_workspace_id'), 'initiatives', ['workspace_id'])

    op.create_table(
        'milestones',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('project_id', sa.String(length=36), nullable=False),
        sa.Column('initiative_id', sa.String(length=36), nullable=True),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text(), nullable=False, server_default=''),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='planned'),
        sa.Column('target_date', sa.Date(), nullable=True),
        *_cols(),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['initiative_id'], ['initiatives.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_milestones_project_id'), 'milestones', ['project_id'])
    op.create_index(op.f('ix_milestones_initiative_id'), 'milestones', ['initiative_id'])

    op.create_table(
        'releases',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('project_id', sa.String(length=36), nullable=False),
        sa.Column('version', sa.String(length=40), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False, server_default=''),
        sa.Column('changelog_md', sa.Text(), nullable=False, server_default=''),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='unreleased'),
        sa.Column('released_at', sa.DateTime(timezone=True), nullable=True),
        *_cols(),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_releases_project_id'), 'releases', ['project_id'])

    op.add_column('stories', sa.Column('milestone_id', sa.String(length=36), nullable=True))
    op.add_column('stories', sa.Column('release_id', sa.String(length=36), nullable=True))
    op.create_foreign_key('fk_stories_milestone', 'stories', 'milestones', ['milestone_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key('fk_stories_release', 'stories', 'releases', ['release_id'], ['id'], ondelete='SET NULL')
    op.create_index(op.f('ix_stories_milestone_id'), 'stories', ['milestone_id'])
    op.create_index(op.f('ix_stories_release_id'), 'stories', ['release_id'])


def downgrade() -> None:
    op.drop_index(op.f('ix_stories_release_id'), table_name='stories')
    op.drop_index(op.f('ix_stories_milestone_id'), table_name='stories')
    op.drop_constraint('fk_stories_release', 'stories', type_='foreignkey')
    op.drop_constraint('fk_stories_milestone', 'stories', type_='foreignkey')
    op.drop_column('stories', 'release_id')
    op.drop_column('stories', 'milestone_id')
    op.drop_index(op.f('ix_releases_project_id'), table_name='releases')
    op.drop_table('releases')
    op.drop_index(op.f('ix_milestones_initiative_id'), table_name='milestones')
    op.drop_index(op.f('ix_milestones_project_id'), table_name='milestones')
    op.drop_table('milestones')
    op.drop_index(op.f('ix_initiatives_workspace_id'), table_name='initiatives')
    op.drop_table('initiatives')
    # llm_usage_source 'roadmap' value is left in place (PG can't drop enum values).
