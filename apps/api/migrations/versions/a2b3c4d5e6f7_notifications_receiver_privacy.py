"""notifications: receiver_id privacy + notification_templates

Revision ID: a2b3c4d5e6f7
Revises: e9c1f2a3b4d7
Create Date: 2026-07-05

"""
from datetime import datetime, timezone
from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "a2b3c4d5e6f7"
down_revision: Union[str, Sequence[str], None] = "e9c1f2a3b4d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_STORY_ASSIGNED = {
    "trigger_key": "story.assigned",
    "kind": "assignment",
    "label": "Story assigned",
    "description": "When a story assignee is set or changed to another member.",
    "title_template": "{story}",
    "body_template": "{actor} assigned you in {project}",
    "default_title_template": "{story}",
    "default_body_template": "{actor} assigned you in {project}",
    "variables": ["actor", "project", "story"],
    "enabled": True,
}

_SPRINT_ZERO = {
    "trigger_key": "sprint.zero_complete",
    "kind": "sprint",
    "label": "Sprint-0 complete",
    "description": "When all required BMAD Sprint-0 cards are done.",
    "title_template": "Sprint-0 complete",
    "body_template": "{project} finished BMAD planning",
    "default_title_template": "Sprint-0 complete",
    "default_body_template": "{project} finished BMAD planning",
    "variables": ["project"],
    "enabled": True,
}


NOTIFICATION_KIND = postgresql.ENUM(
    "mention", "assignment", "sprint", "system", name="notification_kind", create_type=False
)


def upgrade() -> None:
    op.execute("DELETE FROM notifications")

    op.add_column("notifications", sa.Column("receiver_id", sa.String(length=36), nullable=True))
    op.add_column("notifications", sa.Column("triggered_by_id", sa.String(length=36), nullable=True))
    op.add_column("notifications", sa.Column("project_id", sa.String(length=36), nullable=True))
    op.create_foreign_key(
        "fk_notifications_receiver_id_users",
        "notifications",
        "users",
        ["receiver_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_notifications_triggered_by_id_users",
        "notifications",
        "users",
        ["triggered_by_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_notifications_project_id_projects",
        "notifications",
        "projects",
        ["project_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.alter_column("notifications", "receiver_id", nullable=False)
    op.create_index(op.f("ix_notifications_receiver_id"), "notifications", ["receiver_id"], unique=False)
    op.create_index(
        "ix_notifications_ws_receiver_read_created",
        "notifications",
        ["workspace_id", "receiver_id", "read", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_notifications_receiver_created",
        "notifications",
        ["receiver_id", "created_at"],
        unique=False,
    )

    op.create_table(
        "notification_templates",
        sa.Column("trigger_key", sa.String(length=80), nullable=False),
        sa.Column("kind", NOTIFICATION_KIND, nullable=False),
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("title_template", sa.String(length=200), nullable=False),
        sa.Column("body_template", sa.Text(), nullable=False),
        sa.Column("default_title_template", sa.String(length=200), nullable=False),
        sa.Column("default_body_template", sa.Text(), nullable=False),
        sa.Column("variables", sa.JSON(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("trigger_key"),
    )
    op.create_index(
        op.f("ix_notification_templates_trigger_key"),
        "notification_templates",
        ["trigger_key"],
        unique=True,
    )

    conn = op.get_bind()
    now = datetime.now(timezone.utc)
    for seed in (_STORY_ASSIGNED, _SPRINT_ZERO):
        conn.execute(
            sa.text(
                """
                INSERT INTO notification_templates (
                    id, trigger_key, kind, label, description,
                    title_template, body_template, default_title_template, default_body_template,
                    variables, enabled, created_at, updated_at
                ) VALUES (
                    :id, :trigger_key, CAST(:kind AS notification_kind), :label, :description,
                    :title_template, :body_template, :default_title_template, :default_body_template,
                    CAST(:variables AS json), :enabled, :created_at, :updated_at
                )
                """
            ),
            {
                "id": str(uuid.uuid4()),
                "trigger_key": seed["trigger_key"],
                "kind": seed["kind"],
                "label": seed["label"],
                "description": seed["description"],
                "title_template": seed["title_template"],
                "body_template": seed["body_template"],
                "default_title_template": seed["default_title_template"],
                "default_body_template": seed["default_body_template"],
                "variables": __import__("json").dumps(seed["variables"]),
                "enabled": seed["enabled"],
                "created_at": now,
                "updated_at": now,
            },
        )


def downgrade() -> None:
    op.drop_index(op.f("ix_notification_templates_trigger_key"), table_name="notification_templates")
    op.drop_table("notification_templates")
    op.drop_index("ix_notifications_receiver_created", table_name="notifications")
    op.drop_index("ix_notifications_ws_receiver_read_created", table_name="notifications")
    op.drop_index(op.f("ix_notifications_receiver_id"), table_name="notifications")
    op.drop_constraint("fk_notifications_project_id_projects", "notifications", type_="foreignkey")
    op.drop_constraint("fk_notifications_triggered_by_id_users", "notifications", type_="foreignkey")
    op.drop_constraint("fk_notifications_receiver_id_users", "notifications", type_="foreignkey")
    op.drop_column("notifications", "project_id")
    op.drop_column("notifications", "triggered_by_id")
    op.drop_column("notifications", "receiver_id")
