"""epics table → stories.type=epic; drop stories.epic_id

Revision ID: f1a2b3c4d5e6
Revises: e7f8a9b0c1d2
Create Date: 2026-07-05

Migrates legacy `epics` rows into `stories` (type=epic), remaps child
`stories.epic_id` → `parent_id`, then drops the legacy table/column.
"""
from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa


revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "e7f8a9b0c1d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(conn, name: str) -> bool:
    return bool(
        conn.execute(
            sa.text(
                "SELECT EXISTS ("
                "SELECT 1 FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_name = :name"
                ")"
            ),
            {"name": name},
        ).scalar()
    )


def _column_exists(conn, table: str, column: str) -> bool:
    return bool(
        conn.execute(
            sa.text(
                "SELECT EXISTS ("
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name = :table "
                "AND column_name = :column"
                ")"
            ),
            {"table": table, "column": column},
        ).scalar()
    )


def upgrade() -> None:
    conn = op.get_bind()
    has_epics = _table_exists(conn, "epics")
    has_epic_id = _column_exists(conn, "stories", "epic_id")

    if has_epics:
        epic_count = conn.execute(sa.text("SELECT COUNT(*) FROM epics")).scalar() or 0
        if epic_count and has_epic_id:
            epics = conn.execute(
                sa.text(
                    "SELECT id, project_id, title, description, sort_order "
                    "FROM epics ORDER BY sort_order"
                )
            ).fetchall()
            mapping: dict[str, str] = {}
            for epic in epics:
                epic_id, project_id, title, description, sort_order = epic
                sprint_zero = conn.execute(
                    sa.text(
                        "SELECT id FROM cycles WHERE project_id = :pid "
                        "AND is_sprint_zero = true LIMIT 1"
                    ),
                    {"pid": project_id},
                ).scalar()
                new_id = str(uuid.uuid4())
                conn.execute(
                    sa.text(
                        """
                        INSERT INTO stories (
                            id, project_id, cycle_id, parent_id, title, description,
                            status, priority, type, sort_order,
                            bmad_is_locked, bmad_is_required, bmad_skipped,
                            created_at, updated_at
                        )
                        VALUES (
                            :new_id, :project_id, :cycle_id, NULL, :title, :description,
                            'todo', 'none', 'epic', :sort_order,
                            false, false, false,
                            NOW(), NOW()
                        )
                        """
                    ),
                    {
                        "new_id": new_id,
                        "project_id": project_id,
                        "cycle_id": sprint_zero,
                        "title": title,
                        "description": description or "",
                        "sort_order": sort_order,
                    },
                )
                mapping[epic_id] = new_id

            for old_epic_id, new_parent_id in mapping.items():
                conn.execute(
                    sa.text(
                        """
                        UPDATE stories
                        SET parent_id = :parent_id, epic_id = NULL
                        WHERE epic_id = :old_epic_id
                        """
                    ),
                    {"parent_id": new_parent_id, "old_epic_id": old_epic_id},
                )

    if has_epic_id:
        op.drop_constraint("fk_stories_epic_id_epics", "stories", type_="foreignkey")
        op.drop_index(op.f("ix_stories_epic_id"), table_name="stories")
        op.drop_column("stories", "epic_id")

    if has_epics:
        op.drop_index(op.f("ix_epics_project_id"), table_name="epics")
        op.drop_table("epics")


def downgrade() -> None:
    op.create_table(
        "epics",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("artifact_id", sa.String(length=36), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["artifact_id"], ["artifacts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_epics_project_id"), "epics", ["project_id"], unique=False)
    op.add_column("stories", sa.Column("epic_id", sa.String(length=36), nullable=True))
    op.create_index(op.f("ix_stories_epic_id"), "stories", ["epic_id"], unique=False)
    op.create_foreign_key(
        "fk_stories_epic_id_epics", "stories", "epics", ["epic_id"], ["id"], ondelete="SET NULL"
    )
