"""Seed M1 notification template trigger keys."""

from datetime import datetime, timezone
from typing import Sequence, Union
import json
import uuid

from alembic import op
import sqlalchemy as sa


revision: str = "b4c5d6e7f8a9"
down_revision: Union[str, Sequence[str], None] = "a2b3c4d5e6f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_M1_TEMPLATES = (
    {
        "trigger_key": "story.created.assigned",
        "kind": "assignment",
        "label": "Story created with assignee",
        "description": "When a new work item is created already assigned to someone.",
        "title_template": "{story}",
        "body_template": "{actor} assigned you in {project}",
        "default_title_template": "{story}",
        "default_body_template": "{actor} assigned you in {project}",
        "variables": ["actor", "project", "story"],
    },
    {
        "trigger_key": "story.comment",
        "kind": "system",
        "label": "Story comment",
        "description": "When someone comments on a story you watch.",
        "title_template": "New comment",
        "body_template": "{actor} commented on {story}",
        "default_title_template": "New comment",
        "default_body_template": "{actor} commented on {story}",
        "variables": ["actor", "story"],
    },
    {
        "trigger_key": "story.completed",
        "kind": "system",
        "label": "Story completed",
        "description": "When a watched story moves to done.",
        "title_template": "Story completed",
        "body_template": "{actor} completed {story}",
        "default_title_template": "Story completed",
        "default_body_template": "{actor} completed {story}",
        "variables": ["actor", "story"],
    },
    {
        "trigger_key": "mention.story",
        "kind": "mention",
        "label": "Mentioned in story",
        "description": "When someone @-mentions you in a story description or comment.",
        "title_template": "Mentioned you",
        "body_template": "{actor} mentioned you in {story}",
        "default_title_template": "Mentioned you",
        "default_body_template": "{actor} mentioned you in {story}",
        "variables": ["actor", "story"],
    },
)


def upgrade() -> None:
    conn = op.get_bind()
    now = datetime.now(timezone.utc)
    for seed in _M1_TEMPLATES:
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
                    CAST(:variables AS json), true, :created_at, :updated_at
                )
                ON CONFLICT (trigger_key) DO NOTHING
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
                "variables": json.dumps(seed["variables"]),
                "created_at": now,
                "updated_at": now,
            },
        )


def downgrade() -> None:
    keys = ", ".join(f"'{t['trigger_key']}'" for t in _M1_TEMPLATES)
    op.execute(sa.text(f"DELETE FROM notification_templates WHERE trigger_key IN ({keys})"))
