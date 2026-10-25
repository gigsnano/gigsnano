"""Enable email on core PM notification templates."""

from collections.abc import Sequence
from datetime import UTC, datetime

import sqlalchemy as sa
from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: str | None = "c3d4e5f6a9b0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_PM_EMAIL = (
    {
        "trigger_key": "story.assigned",
        "email_subject_template": "{story}",
        "email_body_html_template": "<p>{actor} assigned you to <b>{story}</b> in {project}.</p>",
    },
    {
        "trigger_key": "story.created.assigned",
        "email_subject_template": "{story}",
        "email_body_html_template": "<p>{actor} assigned you to <b>{story}</b> in {project}.</p>",
    },
    {
        "trigger_key": "sprint.zero_complete",
        "email_subject_template": "Sprint-0 complete — {project}",
        "email_body_html_template": "<p><b>{project}</b> finished BMAD planning.</p>",
    },
    {
        "trigger_key": "sprint.plan_ready",
        "email_subject_template": "Sprint plan ready — {project}",
        "email_body_html_template": "<p>The sprint plan for <b>{project}</b> is ready.</p>",
    },
    {
        "trigger_key": "mention.story",
        "email_subject_template": "Mentioned in {story}",
        "email_body_html_template": "<p>{actor} mentioned you in <b>{story}</b>.</p>",
    },
    {
        "trigger_key": "story.completed",
        "email_subject_template": "Story completed — {story}",
        "email_body_html_template": "<p>{actor} completed <b>{story}</b>.</p>",
    },
    {
        "trigger_key": "story.comment",
        "email_subject_template": "New comment on {story}",
        "email_body_html_template": "<p>{actor} commented on <b>{story}</b>.</p>",
    },
    {
        "trigger_key": "mention.document",
        "email_subject_template": "Mentioned in {document}",
        "email_body_html_template": "<p>{actor} mentioned you in <b>{document}</b>.</p>",
    },
    {
        "trigger_key": "document.comment.assigned",
        "email_subject_template": "Comment assigned — {document}",
        "email_body_html_template": "<p>{actor} assigned you a comment on <b>{document}</b>.</p>",
    },
    {
        "trigger_key": "project.member_added",
        "email_subject_template": "Added to {project}",
        "email_body_html_template": "<p>{actor} added you to <b>{project}</b>.</p>",
    },
    {
        "trigger_key": "workspace.invite_pending",
        "email_subject_template": "Invitation to {workspace}",
        "email_body_html_template": "<p>{actor} invited you to join <b>{workspace}</b>.</p>",
    },
    {
        "trigger_key": "export.ready",
        "email_subject_template": "Your export is ready",
        "email_body_html_template": "<p>Your workspace export is ready to download.</p>",
    },
    {
        "trigger_key": "readiness.concerns",
        "email_subject_template": "Readiness concerns — {project}",
        "email_body_html_template": "<p>Implementation readiness for <b>{project}</b> has concerns.</p>",
    },
    {
        "trigger_key": "readiness.fail",
        "email_subject_template": "Readiness failed — {project}",
        "email_body_html_template": "<p>Implementation readiness for <b>{project}</b> failed.</p>",
    },
)


def upgrade() -> None:
    conn = op.get_bind()
    now = datetime.now(UTC)
    for row in _PM_EMAIL:
        conn.execute(
            sa.text(
                """
                UPDATE notification_templates
                SET email_enabled = true,
                    email_subject_template = :email_subject_template,
                    email_body_html_template = :email_body_html_template,
                    updated_at = :updated_at
                WHERE trigger_key = :trigger_key
                """
            ),
            {**row, "updated_at": now},
        )


def downgrade() -> None:
    conn = op.get_bind()
    now = datetime.now(UTC)
    for row in _PM_EMAIL:
        conn.execute(
            sa.text(
                """
                UPDATE notification_templates
                SET email_enabled = false,
                    email_subject_template = '',
                    email_body_html_template = '',
                    updated_at = :updated_at
                WHERE trigger_key = :trigger_key
                """
            ),
            {"trigger_key": row["trigger_key"], "updated_at": now},
        )
