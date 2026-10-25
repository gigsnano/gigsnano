"""Seed M3 notification template trigger keys."""

from datetime import datetime, timezone
from typing import Sequence, Union
import json
import uuid

from alembic import op
import sqlalchemy as sa


revision: str = "d6e7f8a9b0c1"
down_revision: Union[str, Sequence[str], None] = "c5d6e7f8a9b0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_M3_TEMPLATES = (
    {
        "trigger_key": "sprint.plan_ready",
        "kind": "sprint",
        "label": "Dev sprints ready",
        "description": "When BMAD sprint planning creates dev cycles.",
        "title_template": "Dev sprints ready",
        "body_template": "{project} dev sprints are ready",
        "default_title_template": "Dev sprints ready",
        "default_body_template": "{project} dev sprints are ready",
        "variables": ["project"],
    },
    {
        "trigger_key": "readiness.concerns",
        "kind": "system",
        "label": "Readiness: concerns",
        "description": "When the implementation-readiness gate returns concerns.",
        "title_template": "Readiness: concerns",
        "body_template": "{project} readiness gate returned concerns",
        "default_title_template": "Readiness: concerns",
        "default_body_template": "{project} readiness gate returned concerns",
        "variables": ["project"],
    },
    {
        "trigger_key": "readiness.fail",
        "kind": "system",
        "label": "Readiness: fail",
        "description": "When the implementation-readiness gate fails.",
        "title_template": "Readiness: fail",
        "body_template": "{project} readiness gate failed",
        "default_title_template": "Readiness: fail",
        "default_body_template": "{project} readiness gate failed",
        "variables": ["project"],
    },
)


def upgrade() -> None:
    conn = op.get_bind()
    now = datetime.now(timezone.utc)
    for seed in _M3_TEMPLATES:
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
    keys = ", ".join(f"'{t['trigger_key']}'" for t in _M3_TEMPLATES)
    op.execute(sa.text(f"DELETE FROM notification_templates WHERE trigger_key IN ({keys})"))
