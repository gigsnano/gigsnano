"""artifact file_name + mime_type

Revision ID: f4a6b8c0d2e4
Revises: a8b9c0d1e2f3
Create Date: 2026-07-05 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f4a6b8c0d2e4"
down_revision: Union[str, Sequence[str], None] = "59f4d48d27f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("artifacts", sa.Column("file_name", sa.String(300), nullable=True))
    op.add_column("artifacts", sa.Column("mime_type", sa.String(120), nullable=True))


def downgrade() -> None:
    op.drop_column("artifacts", "mime_type")
    op.drop_column("artifacts", "file_name")
