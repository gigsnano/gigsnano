"""invitation project grants

Revision ID: b5e1c93a7f04
Revises: a3f6c21d84be
Create Date: 2026-08-01

Additive: one JSON column defaulting to an empty list, so existing invitations
keep meaning exactly what they meant before (workspace seat, no project access).
Safe to deploy ahead of the frontend.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'b5e1c93a7f04'
down_revision: Union[str, Sequence[str], None] = 'a3f6c21d84be'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_JSON = sa.JSON(none_as_null=True).with_variant(
    postgresql.JSONB(none_as_null=True, astext_type=sa.Text()), 'postgresql'
)


def upgrade() -> None:
    """Upgrade schema."""
    # server_default so rows written by the pre-deploy code are still readable:
    # the ORM default only applies to inserts this build makes.
    op.add_column(
        'workspace_invitations',
        sa.Column('project_grants', _JSON, nullable=False, server_default='[]'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('workspace_invitations', 'project_grants')
