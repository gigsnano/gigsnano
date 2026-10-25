"""project logo image upload: projects.logo_image_url (GIN-44).

Revision ID: c4d9e2f6a1b3
Revises: b8f2a1c7d4e9
Create Date: 2026-07-16
"""

import sqlalchemy as sa
from alembic import op

revision = "c4d9e2f6a1b3"
down_revision = "b8f2a1c7d4e9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "projects", sa.Column("logo_image_url", sa.String(length=500), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("projects", "logo_image_url")
