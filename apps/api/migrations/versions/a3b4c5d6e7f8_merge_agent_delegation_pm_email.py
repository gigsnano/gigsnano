"""Merge agent delegation and PM notification email heads.

Revision ID: a3b4c5d6e7f8
Revises: agentdeleg0001, d4e5f6a7b8c9
Create Date: 2026-07-06 07:40:00.000000
"""

from typing import Sequence, Union

from alembic import op

revision: str = "a3b4c5d6e7f8"
down_revision: Union[str, Sequence[str], None] = ("agentdeleg0001", "d4e5f6a7b8c9")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
