"""expert rooms: room fields on gigs_threads/messages

Revision ID: 94627876e986
Revises: 626d234fcb35
"""
from alembic import op
import sqlalchemy as sa

revision = "94627876e986"
down_revision = "626d234fcb35"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("gigs_threads", sa.Column("kind", sa.String(length=10), nullable=False, server_default="chat"))
    op.add_column("gigs_threads", sa.Column("participant_agent_ids", sa.JSON(), nullable=False, server_default="[]"))
    op.add_column("gigs_threads", sa.Column("rounds_since_human", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("gigs_messages", sa.Column("speaker", sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column("gigs_messages", "speaker")
    op.drop_column("gigs_threads", "rounds_since_human")
    op.drop_column("gigs_threads", "participant_agent_ids")
    op.drop_column("gigs_threads", "kind")
