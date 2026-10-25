"""code_artifacts: durable per-project code intelligence (GIN-272)

Moves graph/metrics/issues/er/changes off ephemeral per-replica disk into
Postgres JSONB, keyed by (project, kind) and stamped with the indexed commit SHA.

Revision ID: c1a2b3d4e5f6
Revises: d3f5a7c9e1b4
Create Date: 2026-07-19 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'c1a2b3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'd3f5a7c9e1b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'code_artifacts',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('project_id', sa.String(length=36), nullable=False),
        sa.Column(
            'kind',
            sa.Enum('graph', 'metrics', 'issues', 'er', 'changes', name='code_artifact_kind'),
            nullable=False,
        ),
        sa.Column('commit_sha', sa.String(length=64), nullable=True),
        sa.Column('data', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('built_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('project_id', 'kind', name='uq_code_artifact_project_kind'),
    )
    op.create_index('ix_code_artifacts_project_id', 'code_artifacts', ['project_id'])


def downgrade() -> None:
    op.drop_index('ix_code_artifacts_project_id', table_name='code_artifacts')
    op.drop_table('code_artifacts')
    sa.Enum(name='code_artifact_kind').drop(op.get_bind(), checkfirst=True)
