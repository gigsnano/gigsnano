"""M4: artifact comment assignee_user_id + notification template seeds."""

from datetime import datetime, timezone
from typing import Sequence, Union
import json
import uuid

from alembic import op
import sqlalchemy as sa


revision: str = "e7f8a9b0c1d2"
down_revision: Union[str, Sequence[str], None] = "d6e7f8a9b0c1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_M4_TEMPLATES = (
    {
        "trigger_key": "document.comment.assigned",
        "kind": "assignment",
        "label": "Document comment assigned",
        "description": "When someone assigns you a document block comment.",
        "title_template": "{document}",
        "body_template": "{actor} assigned you a comment on {document}",
        "default_title_template": "{document}",
        "default_body_template": "{actor} assigned you a comment on {document}",
        "variables": ["actor", "document"],
    },
    {
        "trigger_key": "mention.document",
        "kind": "mention",
        "label": "Mentioned in document",
        "description": "When someone @-mentions you in a document comment.",
        "title_template": "Mentioned you",
        "body_template": "{actor} mentioned you in {document}",
        "default_title_template": "Mentioned you",
        "default_body_template": "{actor} mentioned you in {document}",
        "variables": ["actor", "document"],
    },
    {
        "trigger_key": "export.ready",
        "kind": "system",
        "label": "Export ready",
        "description": "When a workspace export finishes.",
        "title_template": "Export ready",
        "body_template": "Your export is ready to download",
        "default_title_template": "Export ready",
        "default_body_template": "Your export is ready to download",
        "variables": [],
    },
    {
        "trigger_key": "github.docs_synced",
        "kind": "system",
        "label": "Docs synced",
        "description": "When project docs are pushed to GitHub.",
        "title_template": "Docs synced",
        "body_template": "{project} docs synced to GitHub",
        "default_title_template": "Docs synced",
        "default_body_template": "{project} docs synced to GitHub",
        "variables": ["project"],
    },
)


def upgrade() -> None:
    op.add_column(
        "artifact_comments",
        sa.Column("assignee_user_id", sa.String(), nullable=True),
    )
    op.create_foreign_key(
        "fk_artifact_comments_assignee_user_id_users",
        "artifact_comments",
        "users",
        ["assignee_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    conn = op.get_bind()
    now = datetime.now(timezone.utc)
    for seed in _M4_TEMPLATES:
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
    keys = ", ".join(f"'{t['trigger_key']}'" for t in _M4_TEMPLATES)
    op.execute(sa.text(f"DELETE FROM notification_templates WHERE trigger_key IN ({keys})"))
    op.drop_constraint(
        "fk_artifact_comments_assignee_user_id_users", "artifact_comments", type_="foreignkey"
    )
    op.drop_column("artifact_comments", "assignee_user_id")
