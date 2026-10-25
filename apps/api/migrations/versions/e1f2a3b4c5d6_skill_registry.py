"""GIN-284: portable skill registry — skill_packages + skill_versions.

Revision ID: e1f2a3b4c5d6
Revises: d2f3a4b5c6d7
Create Date: 2026-07-19
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "e1f2a3b4c5d6"
down_revision = "d2f3a4b5c6d7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "skill_packages",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False, index=True),
        sa.Column("visibility", sa.String(length=10), nullable=False, server_default="private"),
        sa.Column("owner_workspace_id", sa.String(length=36),
                  sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("owner_workspace_id", "name", name="uq_skill_pkg_owner_name"),
    )
    op.create_table(
        "skill_versions",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("package_id", sa.String(length=36),
                  sa.ForeignKey("skill_packages.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("version", sa.String(length=20), nullable=False),
        sa.Column("digest", sa.String(length=71), nullable=False),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column("byte_size", sa.Integer(), nullable=False),
        sa.Column("manifest", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("lifecycle", sa.String(length=12), nullable=False, server_default="draft"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("package_id", "version", name="uq_skill_ver_pkg_version"),
    )


def downgrade() -> None:
    op.drop_table("skill_versions")
    op.drop_table("skill_packages")
