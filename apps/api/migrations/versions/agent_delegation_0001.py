"""agent delegation

Revision ID: agentdeleg0001
Revises: c3d4e5f6a9b0
Create Date: 2026-07-05 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "agentdeleg0001"
down_revision: Union[str, Sequence[str], None] = "c3d4e5f6a9b0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "agent_connections",
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column(
            "provider",
            sa.Enum("cursor", "codex", "claude_code", name="agent_provider"),
            nullable=False,
        ),
        sa.Column("account_label", sa.String(length=200), nullable=False),
        sa.Column(
            "status",
            sa.Enum("connected", "expired", "revoked", name="agent_connection_status"),
            nullable=False,
        ),
        sa.Column("access_token_encrypted", sa.Text(), nullable=True),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "provider", name="uq_agent_connection_user_provider"),
    )
    op.create_index(
        op.f("ix_agent_connections_user_id"), "agent_connections", ["user_id"], unique=False
    )
    op.create_table(
        "delegations",
        sa.Column(
            "unit_type",
            sa.Enum("work_item", "bmad_card", name="delegation_unit"),
            nullable=False,
        ),
        sa.Column("unit_id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column(
            "provider",
            sa.Enum("cursor", "codex", "claude_code", name="agent_provider"),
            nullable=False,
        ),
        sa.Column("connection_id", sa.String(length=36), nullable=True),
        sa.Column("delegated_by", sa.String(length=36), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "queued", "running", "awaiting_review", "completed", "failed", "cancelled",
                name="delegation_status",
            ),
            nullable=False,
        ),
        sa.Column("custom_prompt", sa.Text(), nullable=True),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("external_ref", sa.String(length=200), nullable=True),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["unit_id"], ["stories.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["connection_id"], ["agent_connections.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["delegated_by"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    for col in ("unit_id", "project_id", "workspace_id", "delegated_by"):
        op.create_index(op.f(f"ix_delegations_{col}"), "delegations", [col], unique=False)


def downgrade() -> None:
    op.drop_table("delegations")
    op.drop_table("agent_connections")
    sa.Enum(name="delegation_unit").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="delegation_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="agent_connection_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="agent_provider").drop(op.get_bind(), checkfirst=True)
