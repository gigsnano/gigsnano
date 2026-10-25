"""export_jobs.expires_at (GIN-20 expiring download links)

Revision ID: a9f3e1c2d4b6
Revises: 6212f1037f52
Create Date: 2026-07-10

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a9f3e1c2d4b6"
down_revision: Union[str, Sequence[str], None] = "6212f1037f52"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "export_jobs", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("export_jobs", "expires_at")
