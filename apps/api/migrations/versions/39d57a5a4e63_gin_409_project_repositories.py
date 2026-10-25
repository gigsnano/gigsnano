"""GIN-409: project_repositories + system_bundles + backfill Primary/Default.

Introduces first-class multi-repository connections and System Bundles, and
migrates every existing single-repository project to one Primary ProjectRepository
plus a valid Default bundle. Legacy Project.repo_* columns are LEFT IN PLACE
(dropped only once telemetry proves no caller reads them).

Enums are String-backed in the models, so this migration mints no Postgres enum
types — only plain columns — sidestepping the "enum created twice" upgrade abort.

Revision ID: 39d57a5a4e63
Revises: b8e2c41f6a05
Create Date: 2026-07-24
"""

import sqlalchemy as sa
from alembic import op

from gigsnano_api.features.system.backfill import backfill_connection, rollback_connection
from gigsnano_api.models.base import JSON_DOC

revision = "39d57a5a4e63"
down_revision = "b8e2c41f6a05"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "project_repositories",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("provider_connection_id", sa.String(length=36), nullable=True),
        sa.Column("provider", sa.String(length=40), nullable=False, server_default="github"),
        sa.Column("external_repository_id", sa.String(length=200), nullable=False),
        sa.Column("full_name", sa.String(length=300), nullable=False),
        sa.Column("display_name", sa.String(length=200), nullable=False),
        sa.Column(
            "repository_type", sa.String(length=20), nullable=False, server_default="service"
        ),
        sa.Column("default_branch", sa.String(length=200), nullable=False, server_default="main"),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "default_access", sa.String(length=20), nullable=False, server_default="reference"
        ),
        sa.Column("clone_status", sa.String(length=20), nullable=False, server_default="none"),
        sa.Column("clone_error", sa.Text(), nullable=True),
        sa.Column("sync_status", sa.String(length=20), nullable=False, server_default="none"),
        sa.Column("sync_error", sa.Text(), nullable=True),
        sa.Column("index_status", sa.String(length=20), nullable=False, server_default="none"),
        sa.Column("index_error", sa.Text(), nullable=True),
        sa.Column("indexed_commit_sha", sa.String(length=64), nullable=True),
        sa.Column("indexed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(length=36), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "project_id", "provider", "external_repository_id", name="uq_project_repo_identity"
        ),
    )
    op.create_index("ix_project_repositories_project_id", "project_repositories", ["project_id"])
    op.create_index(
        "uq_project_repo_one_active_primary",
        "project_repositories",
        ["project_id"],
        unique=True,
        postgresql_where=sa.text("is_primary AND archived_at IS NULL"),
        sqlite_where=sa.text("is_primary = 1 AND archived_at IS NULL"),
    )

    op.create_table(
        "system_bundles",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("current_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_by", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_system_bundles_project_id", "system_bundles", ["project_id"])

    op.create_table(
        "system_bundle_versions",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("bundle_id", sa.String(length=36), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("configuration_json", JSON_DOC, nullable=True),
        sa.Column("validation_result_json", JSON_DOC, nullable=True),
        sa.Column("created_by", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["bundle_id"], ["system_bundles.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("bundle_id", "version", name="uq_bundle_version"),
    )
    op.create_index("ix_system_bundle_versions_bundle_id", "system_bundle_versions", ["bundle_id"])

    # Data migration: one Primary repo + Default bundle per legacy single-repo project.
    # Idempotent, so a rerun after a partial failure only fills the gaps.
    backfill_connection(op.get_bind())


def downgrade() -> None:
    # Drop the seeded data first (harmless even though the tables go next — keeps
    # the data-rollback path exercised), then the tables. Legacy columns untouched.
    rollback_connection(op.get_bind())
    op.drop_index("ix_system_bundle_versions_bundle_id", table_name="system_bundle_versions")
    op.drop_table("system_bundle_versions")
    op.drop_index("ix_system_bundles_project_id", table_name="system_bundles")
    op.drop_table("system_bundles")
    op.drop_index("uq_project_repo_one_active_primary", table_name="project_repositories")
    op.drop_index("ix_project_repositories_project_id", table_name="project_repositories")
    op.drop_table("project_repositories")
