"""oauth mcp tables

Revision ID: a1f2e3d4c5b6
Revises: 9533c296e232
Create Date: 2026-07-07 13:30:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1f2e3d4c5b6"
down_revision: Union[str, Sequence[str], None] = "9533c296e232"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "oauth_clients",
        sa.Column("client_id", sa.String(length=64), nullable=False),
        sa.Column("client_name", sa.String(length=120), nullable=False),
        sa.Column("redirect_uris", sa.JSON(), nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_oauth_clients_client_id"), "oauth_clients", ["client_id"], unique=True)

    op.create_table(
        "oauth_authorization_codes",
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("client_id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("redirect_uri", sa.String(length=512), nullable=False),
        sa.Column("code_challenge", sa.String(length=128), nullable=False),
        sa.Column("scope", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used", sa.Boolean(), nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_oauth_authorization_codes_code"),
        "oauth_authorization_codes",
        ["code"],
        unique=True,
    )
    op.create_index(
        op.f("ix_oauth_authorization_codes_client_id"),
        "oauth_authorization_codes",
        ["client_id"],
        unique=False,
    )

    op.create_table(
        "oauth_refresh_tokens",
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("client_id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("scope", sa.String(length=64), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_oauth_refresh_tokens_token_hash"),
        "oauth_refresh_tokens",
        ["token_hash"],
        unique=True,
    )
    op.create_index(
        op.f("ix_oauth_refresh_tokens_client_id"),
        "oauth_refresh_tokens",
        ["client_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_oauth_refresh_tokens_client_id"), table_name="oauth_refresh_tokens")
    op.drop_index(op.f("ix_oauth_refresh_tokens_token_hash"), table_name="oauth_refresh_tokens")
    op.drop_table("oauth_refresh_tokens")
    op.drop_index(op.f("ix_oauth_authorization_codes_client_id"), table_name="oauth_authorization_codes")
    op.drop_index(op.f("ix_oauth_authorization_codes_code"), table_name="oauth_authorization_codes")
    op.drop_table("oauth_authorization_codes")
    op.drop_index(op.f("ix_oauth_clients_client_id"), table_name="oauth_clients")
    op.drop_table("oauth_clients")
