"""GIN-475: work items support multiple labels.

Adds the `story_labels` association table, backfills it from the singular
`stories.label_id`, then drops that column — the association table becomes the
only source of truth, so there is nothing left to drift out of sync.

Revision ID: a7c4e1b90f23
Revises: d1f4b8c2e6a9
Create Date: 2026-07-25
"""

import uuid

import sqlalchemy as sa
from alembic import op

revision = "a7c4e1b90f23"
down_revision = "d1f4b8c2e6a9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "story_labels",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("story_id", sa.String(length=36), nullable=False),
        sa.Column("label_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["story_id"], ["stories.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["label_id"], ["project_labels.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("story_id", "label_id", name="uq_story_labels_story_label"),
    )
    op.create_index("ix_story_labels_story_id", "story_labels", ["story_id"])
    op.create_index("ix_story_labels_label_id", "story_labels", ["label_id"])

    # Backfill every existing single assignment. Trashed rows are included on
    # purpose — restoring a work item must bring its label back with it. Ids are
    # generated per row in Python so this doesn't depend on a uuid extension.
    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            "SELECT id, label_id, created_at, updated_at FROM stories WHERE label_id IS NOT NULL"
        )
    ).all()
    for story_id, label_id, created_at, updated_at in rows:
        conn.execute(
            sa.text(
                "INSERT INTO story_labels (id, story_id, label_id, created_at, updated_at)"
                " VALUES (:id, :story_id, :label_id, :created_at, :updated_at)"
            ),
            {
                "id": str(uuid.uuid4()),
                "story_id": story_id,
                "label_id": label_id,
                "created_at": created_at,
                "updated_at": updated_at,
            },
        )

    op.drop_column("stories", "label_id")


def downgrade() -> None:
    op.add_column("stories", sa.Column("label_id", sa.String(length=36), nullable=True))
    # Lossy by nature: the old column holds one label, so restore the alphabetically
    # first per item and leave the rest behind.
    op.execute(
        sa.text(
            """
            UPDATE stories SET label_id = (
                SELECT sl.label_id
                FROM story_labels sl
                JOIN project_labels pl ON pl.id = sl.label_id
                WHERE sl.story_id = stories.id
                ORDER BY pl.name
                LIMIT 1
            )
            """
        )
    )
    op.drop_index("ix_story_labels_label_id", table_name="story_labels")
    op.drop_index("ix_story_labels_story_id", table_name="story_labels")
    op.drop_table("story_labels")
