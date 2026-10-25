"""custom fields: project_custom_fields + story_custom_field_values

Revision ID: 8113f90f3446
Revises: 1f5ea9405dbe
Create Date: 2026-07-14 06:02:53.662194

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "8113f90f3446"
down_revision: Union[str, Sequence[str], None] = "1f5ea9405dbe"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "project_custom_fields",
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column(
            "field_type",
            sa.Enum("text", "number", "date", "select", name="custom_field_type"),
            nullable=False,
        ),
        sa.Column("options", sa.JSON(), nullable=True),
        sa.Column("sort_order", sa.Float(), nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "name"),
    )
    op.create_index(
        op.f("ix_project_custom_fields_project_id"),
        "project_custom_fields",
        ["project_id"],
        unique=False,
    )

    op.create_table(
        "story_custom_field_values",
        sa.Column("story_id", sa.String(length=36), nullable=False),
        sa.Column("field_id", sa.String(length=36), nullable=False),
        sa.Column("value", sa.Text(), nullable=True),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["story_id"], ["stories.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["field_id"], ["project_custom_fields.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("story_id", "field_id"),
    )
    op.create_index(
        op.f("ix_story_custom_field_values_story_id"),
        "story_custom_field_values",
        ["story_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_story_custom_field_values_field_id"),
        "story_custom_field_values",
        ["field_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_story_custom_field_values_field_id"), table_name="story_custom_field_values"
    )
    op.drop_index(
        op.f("ix_story_custom_field_values_story_id"), table_name="story_custom_field_values"
    )
    op.drop_table("story_custom_field_values")
    op.drop_index(
        op.f("ix_project_custom_fields_project_id"), table_name="project_custom_fields"
    )
    op.drop_table("project_custom_fields")
    # Drop the native PG ENUM type the table implicitly created.
    op.execute("DROP TYPE IF EXISTS custom_field_type")
