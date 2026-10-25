"""GIN-396: import plans — a dry-run change set proposed from package findings.

Revision ID: a2d5f70b9e14
Revises: f1a63d8e4c77
Create Date: 2026-07-23
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "a2d5f70b9e14"
down_revision = "f1a63d8e4c77"
branch_labels = None
depends_on = None

# Plain Strings, no sa.Enum: the op/target/status vocabularies still grow with
# GIN-397, and altering a live DB enum is the hazard this project has been bitten by.
_JSON = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def upgrade() -> None:
    op.create_table(
        "import_plans",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("package_id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("strategy", sa.String(length=20), nullable=False, server_default="convert"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
        sa.Column("created_by_id", sa.String(length=36), nullable=True),
        sa.Column("correlation_id", sa.String(length=64), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["package_id"], ["document_packages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_import_plans_package_id", "import_plans", ["package_id"])
    op.create_index("ix_import_plans_project_id", "import_plans", ["project_id"])
    op.create_index("ix_import_plans_status", "import_plans", ["status"])

    op.create_table(
        "import_changes",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("plan_id", sa.String(length=36), nullable=False),
        sa.Column("op", sa.String(length=20), nullable=False, server_default="create"),
        sa.Column("target", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="proposed"),
        sa.Column("temp_key", sa.String(length=120), nullable=False),
        sa.Column("parent_temp_key", sa.String(length=120), nullable=True),
        sa.Column("title", sa.String(length=300), nullable=False, server_default=""),
        sa.Column("payload", _JSON, nullable=True),
        sa.Column("finding_id", sa.String(length=36), nullable=True),
        sa.Column("reason", sa.Text(), nullable=False, server_default=""),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="0.5"),
        sa.Column("created_object_id", sa.String(length=36), nullable=True),
        sa.Column("error", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["plan_id"], ["import_plans.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["finding_id"], ["package_findings.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_import_changes_plan_id", "import_changes", ["plan_id"])
    op.create_index("ix_import_changes_status", "import_changes", ["status"])
    op.create_index("ix_import_changes_temp_key", "import_changes", ["temp_key"])


def downgrade() -> None:
    op.drop_index("ix_import_changes_temp_key", table_name="import_changes")
    op.drop_index("ix_import_changes_status", table_name="import_changes")
    op.drop_index("ix_import_changes_plan_id", table_name="import_changes")
    op.drop_table("import_changes")
    op.drop_index("ix_import_plans_status", table_name="import_plans")
    op.drop_index("ix_import_plans_project_id", table_name="import_plans")
    op.drop_index("ix_import_plans_package_id", table_name="import_plans")
    op.drop_table("import_plans")
