"""GIN-443/445/446: solution foundation — setup_drafts + project metadata.

Adds nullable `projects.solution_key` / `projects.solution_version` and the
`setup_drafts` table for in-progress solution setup before a project exists.
Expand/contract only — no cohort enablement, no routers.

Revision ID: b8c2e4f70a15
Revises: a7c4e1b90f23
Create Date: 2026-07-26
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "b8c2e4f70a15"
down_revision = "a7c4e1b90f23"
branch_labels = None
depends_on = None

_JSON = sa.JSON(none_as_null=True).with_variant(
    postgresql.JSONB(none_as_null=True), "postgresql"
)


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("solution_key", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "projects",
        sa.Column("solution_version", sa.Integer(), nullable=True),
    )
    op.create_index("ix_projects_solution_key", "projects", ["solution_key"])

    op.create_table(
        "setup_drafts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("created_by_id", sa.String(length=36), nullable=False),
        sa.Column("solution_key", sa.String(length=64), nullable=False),
        sa.Column("solution_version", sa.Integer(), nullable=False),
        sa.Column("starting_point", sa.String(length=64), nullable=True),
        sa.Column("step", sa.String(length=64), nullable=False),
        sa.Column("values", _JSON, nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_setup_drafts_workspace_id", "setup_drafts", ["workspace_id"])
    op.create_index("ix_setup_drafts_created_by_id", "setup_drafts", ["created_by_id"])
    op.create_index("ix_setup_drafts_expires_at", "setup_drafts", ["expires_at"])
    op.create_index(
        "ix_setup_drafts_workspace_id_created_by_id",
        "setup_drafts",
        ["workspace_id", "created_by_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_setup_drafts_workspace_id_created_by_id", table_name="setup_drafts"
    )
    op.drop_index("ix_setup_drafts_expires_at", table_name="setup_drafts")
    op.drop_index("ix_setup_drafts_created_by_id", table_name="setup_drafts")
    op.drop_index("ix_setup_drafts_workspace_id", table_name="setup_drafts")
    op.drop_table("setup_drafts")

    op.drop_index("ix_projects_solution_key", table_name="projects")
    op.drop_column("projects", "solution_version")
    op.drop_column("projects", "solution_key")
