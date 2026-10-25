"""story sort_order int -> float

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-07-07
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c2d3e4f5a6b7"
down_revision: Union[str, Sequence[str], None] = "b1c2d3e4f5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "stories",
        "sort_order",
        type_=sa.Float(),
        existing_type=sa.Integer(),
        existing_nullable=False,
        postgresql_using="sort_order::double precision",
    )


def downgrade() -> None:
    op.alter_column(
        "stories",
        "sort_order",
        type_=sa.Integer(),
        existing_type=sa.Float(),
        existing_nullable=False,
        postgresql_using="sort_order::integer",
    )
