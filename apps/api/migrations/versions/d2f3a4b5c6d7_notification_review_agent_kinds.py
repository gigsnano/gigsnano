"""GIN-293: add REVIEW + AGENT notification kinds, reclassify readiness → review,
seed the agent.run_completed template.

Revision ID: d2f3a4b5c6d7
Revises: c1a2b3d4e5f6
Create Date: 2026-07-19
"""

import uuid

import sqlalchemy as sa
from alembic import op

revision = "d2f3a4b5c6d7"
down_revision = "c1a2b3d4e5f6"
branch_labels = None
depends_on = None


_AGENT_TEMPLATE = {
    "trigger_key": "agent.run_completed",
    "kind": "agent",
    "label": "Agent run completed",
    "description": "When a BMAD agent finishes a workflow on a work item.",
    "title_template": "{agent} finished {workflow}",
    "body_template": "{agent} completed {workflow} on {story}",
    "default_title_template": "{agent} finished {workflow}",
    "default_body_template": "{agent} completed {workflow} on {story}",
}


def upgrade() -> None:
    # ADD VALUE cannot run inside a transaction block; commit it before use.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'review'")
        op.execute("ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'agent'")

    # Readiness gates ARE the "reviews & approvals" surface — reclassify their
    # templates (resolve_and_notify derives a notification's kind from the template).
    op.execute(
        "UPDATE notification_templates SET kind = CAST('review' AS notification_kind) "
        "WHERE trigger_key IN ('readiness.concerns', 'readiness.fail')"
    )

    # op.execute() does not take bind params — bind them through the connection.
    op.get_bind().execute(
        sa.text(
            """
            INSERT INTO notification_templates (
                id, trigger_key, kind, label, description,
                title_template, body_template, default_title_template, default_body_template,
                variables, enabled, email_enabled, email_subject_template, email_body_html_template,
                created_at, updated_at
            ) VALUES (
                :id, :trigger_key, CAST(:kind AS notification_kind), :label, :description,
                :title_template, :body_template, :default_title_template, :default_body_template,
                CAST(:variables AS json), true, false, '', '', now(), now()
            )
            ON CONFLICT (trigger_key) DO NOTHING
            """
        ),
        {
            "id": str(uuid.uuid4()),
            "variables": '["agent", "workflow", "story"]',
            **_AGENT_TEMPLATE,
        },
    )


def downgrade() -> None:
    # Enum values are not removable in Postgres; leave 'review'/'agent' in place
    # (harmless). Revert the data changes only.
    op.execute(
        "UPDATE notification_templates SET kind = CAST('system' AS notification_kind) "
        "WHERE trigger_key IN ('readiness.concerns', 'readiness.fail')"
    )
    op.execute(
        "DELETE FROM notification_templates WHERE trigger_key = 'agent.run_completed'"
    )
