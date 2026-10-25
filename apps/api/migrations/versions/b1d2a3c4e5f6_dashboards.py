"""dashboards table (GIN-46 personal customizable dashboards)

Revision ID: b1d2a3c4e5f6
Revises: 94627876e986
Create Date: 2026-07-13

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b1d2a3c4e5f6"
down_revision: Union[str, Sequence[str], None] = "94627876e986"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dashboards",
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("owner_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "is_favorite", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("layout", sa.JSON(), nullable=False),
        sa.Column("config", sa.JSON(), nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_dashboards_workspace_id", "dashboards", ["workspace_id"], unique=False
    )
    op.create_index("ix_dashboards_owner_id", "dashboards", ["owner_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_dashboards_owner_id", table_name="dashboards")
    op.drop_index("ix_dashboards_workspace_id", table_name="dashboards")
    op.drop_table("dashboards")
