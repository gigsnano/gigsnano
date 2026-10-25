"""mcp active workspace column

Revision ID: b1c2d3e4f5a6
Revises: a1f2e3d4c5b6
Create Date: 2026-07-07

Adds users.mcp_active_workspace_slug — the workspace a multi-workspace user has
explicitly selected for the hosted MCP (set via the set_active_workspace tool).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, Sequence[str], None] = "a1f2e3d4c5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("mcp_active_workspace_slug", sa.String(length=100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "mcp_active_workspace_slug")
