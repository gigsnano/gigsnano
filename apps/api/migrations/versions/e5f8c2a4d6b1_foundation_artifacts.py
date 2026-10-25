"""foundation artifact library + project pins (GIN-194)

Revision ID: e5f8c2a4d6b1
Revises: d4e7a1b9c3f2
Create Date: 2026-07-17 18:35:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5f8c2a4d6b1'
down_revision: Union[str, Sequence[str], None] = 'd4e7a1b9c3f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'foundation_artifacts',
        sa.Column('artifact_type', sa.String(length=20), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('version', sa.String(length=20), nullable=False),
        sa.Column('visibility', sa.String(length=10), nullable=False),
        sa.Column('owner_workspace_id', sa.String(length=36), nullable=True),
        sa.Column('payload', sa.Text(), nullable=False),
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['owner_workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_foundation_artifacts_owner_workspace_id'),
        'foundation_artifacts', ['owner_workspace_id'], unique=False,
    )
    op.add_column(
        'project_foundations',
        sa.Column('pinned_artifacts', sa.JSON(), nullable=False, server_default='[]'),
    )


def downgrade() -> None:
    op.drop_column('project_foundations', 'pinned_artifacts')
    op.drop_index(op.f('ix_foundation_artifacts_owner_workspace_id'), table_name='foundation_artifacts')
    op.drop_table('foundation_artifacts')
