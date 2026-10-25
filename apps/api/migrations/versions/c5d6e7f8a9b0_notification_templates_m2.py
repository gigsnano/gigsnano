"""Seed M2 notification template trigger keys."""

from datetime import datetime, timezone
from typing import Sequence, Union
import json
import uuid

from alembic import op
import sqlalchemy as sa


revision: str = "c5d6e7f8a9b0"
down_revision: Union[str, Sequence[str], None] = "b4c5d6e7f8a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_M2_TEMPLATES = (
    {
        "trigger_key": "workspace.invite_pending",
        "kind": "system",
        "label": "Workspace invitation",
        "description": "When an existing user is invited to a workspace and must accept.",
        "title_template": "Workspace invitation",
        "body_template": "{actor} invited you to {workspace}",
        "default_title_template": "Workspace invitation",
        "default_body_template": "{actor} invited you to {workspace}",
        "variables": ["actor", "workspace"],
    },
    {
        "trigger_key": "project.member_added",
        "kind": "system",
        "label": "Added to project",
        "description": "When someone adds you to a project.",
        "title_template": "Added to project",
        "body_template": "{actor} added you to {project}",
        "default_title_template": "Added to project",
        "default_body_template": "{actor} added you to {project}",
        "variables": ["actor", "project"],
    },
)


def upgrade() -> None:
    conn = op.get_bind()
    now = datetime.now(timezone.utc)
    for seed in _M2_TEMPLATES:
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
    keys = ", ".join(f"'{t['trigger_key']}'" for t in _M2_TEMPLATES)
    op.execute(sa.text(f"DELETE FROM notification_templates WHERE trigger_key IN ({keys})"))
