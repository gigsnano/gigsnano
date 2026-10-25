"""merge gin20 exports + gin21/23 importers heads

Revision ID: 9786c6da7d65
Revises: a9f3e1c2d4b6, a4b5c6d7e8f9
Create Date: 2026-07-10 21:48:49.354403

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9786c6da7d65'
down_revision: Union[str, Sequence[str], None] = ('a9f3e1c2d4b6', 'a4b5c6d7e8f9')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
