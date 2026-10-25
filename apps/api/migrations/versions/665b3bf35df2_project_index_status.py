"""project index status

Revision ID: 665b3bf35df2
Revises: c2e3f4a5b6c7
Create Date: 2026-07-13 20:16:08.092335

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "665b3bf35df2"
down_revision: Union[str, Sequence[str], None] = "c2e3f4a5b6c7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    index_status = sa.Enum("none", "pending", "indexing", "ready", "failed", name="index_status")
    index_status.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "projects",
        sa.Column("index_status", index_status, nullable=False, server_default="none"),
    )
    op.add_column("projects", sa.Column("index_error", sa.Text(), nullable=True))
    op.add_column("projects", sa.Column("indexed_commit_sha", sa.String(length=64), nullable=True))
    op.add_column("projects", sa.Column("indexed_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("projects", "indexed_at")
    op.drop_column("projects", "indexed_commit_sha")
    op.drop_column("projects", "index_error")
    op.drop_column("projects", "index_status")
    op.execute("DROP TYPE IF EXISTS index_status")
