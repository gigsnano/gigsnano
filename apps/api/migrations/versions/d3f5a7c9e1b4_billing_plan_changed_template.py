"""Seed the billing.plan_changed + billing.invoice_paid notification templates (GIN-129).

Subscription upgrade/downgrade/cancel never emitted a notification or email —
only wallet top-up did. plan_changed covers upgrade, downgrade, and cancel-to-Free
(the {plan} variable carries the new tier). invoice_paid is the recurring monthly
receipt sent on each subscription payment, with a link to the hosted invoice."""

from datetime import datetime, timezone
from typing import Sequence, Union
import json
import uuid

from alembic import op
import sqlalchemy as sa


revision: str = "d3f5a7c9e1b4"
down_revision: Union[str, None] = "c2e4f6a8b0d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_SEEDS = (
    {
        "trigger_key": "billing.plan_changed",
        "kind": "system",
        "label": "Subscription plan changed",
        "description": "Workspace admins notified when the plan is upgraded, downgraded, or cancelled.",
        "title_template": "Your plan changed",
        "body_template": "{workspace} is now on the {plan} plan",
        "default_title_template": "Your plan changed",
        "default_body_template": "{workspace} is now on the {plan} plan",
        "variables": ["workspace", "plan"],
        "email_enabled": True,
        "email_subject_template": "Your {workspace} plan is now {plan}",
        "email_body_html_template": "<p>The <b>{workspace}</b> workspace is now on the <b>{plan}</b> plan.</p>",
    },
    {
        "trigger_key": "billing.invoice_paid",
        "kind": "system",
        "label": "Subscription invoice paid",
        "description": "Workspace admins emailed a copy of the invoice on each subscription payment.",
        "title_template": "Payment received",
        "body_template": "{amount} paid for {workspace}",
        "default_title_template": "Payment received",
        "default_body_template": "{amount} paid for {workspace}",
        "variables": ["workspace", "amount", "invoice_url"],
        "email_enabled": True,
        "email_subject_template": "Your {workspace} invoice — {amount}",
        "email_body_html_template": (
            "<p>We received your payment of <b>{amount}</b> for the <b>{workspace}</b> workspace.</p>"
            "<p><a href=\"{invoice_url}\">View or download your invoice</a></p>"
        ),
    },
)


def upgrade() -> None:
    conn = op.get_bind()
    now = datetime.now(timezone.utc)
    for seed in _SEEDS:
        conn.execute(
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
                    CAST(:variables AS json), true, :email_enabled, :email_subject_template,
                    :email_body_html_template, :created_at, :updated_at
                )
                ON CONFLICT (trigger_key) DO UPDATE SET
                    email_enabled = EXCLUDED.email_enabled,
                    email_subject_template = EXCLUDED.email_subject_template,
                    email_body_html_template = EXCLUDED.email_body_html_template,
                    updated_at = EXCLUDED.updated_at
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
                "email_enabled": seed["email_enabled"],
                "email_subject_template": seed["email_subject_template"],
                "email_body_html_template": seed["email_body_html_template"],
                "created_at": now,
                "updated_at": now,
            },
        )


def downgrade() -> None:
    keys = ", ".join(f"'{s['trigger_key']}'" for s in _SEEDS)
    op.execute(sa.text(f"DELETE FROM notification_templates WHERE trigger_key IN ({keys})"))
