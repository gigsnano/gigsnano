"""Notification template email fields + marketplace/billing email seeds."""

from datetime import datetime, timezone
from typing import Sequence, Union
import json
import uuid

from alembic import op
import sqlalchemy as sa


revision: str = "c3d4e5f6a9b0"
down_revision: Union[str, None] = "b2c3d4e5f6a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_EMAIL_TEMPLATES = (
    {
        "trigger_key": "marketplace.bid_received",
        "kind": "system",
        "label": "Marketplace bid received",
        "description": "Owner notified when a freelancer bids on a listing.",
        "title_template": "New bid on your listing",
        "body_template": "{bidder} bid {amount} on {listing}",
        "default_title_template": "New bid on your listing",
        "default_body_template": "{bidder} bid {amount} on {listing}",
        "variables": ["bidder", "listing", "amount"],
        "email_enabled": True,
        "email_subject_template": "New bid on {listing}",
        "email_body_html_template": "<p>{bidder} bid {amount} on <b>{listing}</b>.</p>",
    },
    {
        "trigger_key": "marketplace.bid_accepted",
        "kind": "system",
        "label": "Marketplace bid accepted",
        "description": "Freelancer notified when their bid is accepted.",
        "title_template": "Your bid was accepted",
        "body_template": "You were hired for {listing}",
        "default_title_template": "Your bid was accepted",
        "default_body_template": "You were hired for {listing}",
        "variables": ["listing"],
        "email_enabled": True,
        "email_subject_template": "You were hired for {listing}",
        "email_body_html_template": "<p>You were hired for <b>{listing}</b>.</p>",
    },
    {
        "trigger_key": "marketplace.bid_declined",
        "kind": "system",
        "label": "Marketplace bid declined",
        "description": "Freelancer notified when another bid is selected.",
        "title_template": "Bid not selected",
        "body_template": "Another freelancer was hired for {listing}",
        "default_title_template": "Bid not selected",
        "default_body_template": "Another freelancer was hired for {listing}",
        "variables": ["listing"],
        "email_enabled": False,
        "email_subject_template": "",
        "email_body_html_template": "",
    },
    {
        "trigger_key": "marketplace.delivered",
        "kind": "system",
        "label": "Marketplace work delivered",
        "description": "Owner notified when a freelancer delivers work.",
        "title_template": "Work delivered",
        "body_template": "{freelancer} delivered work on {listing}",
        "default_title_template": "Work delivered",
        "default_body_template": "{freelancer} delivered work on {listing}",
        "variables": ["freelancer", "listing"],
        "email_enabled": True,
        "email_subject_template": "Work delivered on {listing}",
        "email_body_html_template": "<p>{freelancer} delivered work on <b>{listing}</b>.</p>",
    },
    {
        "trigger_key": "marketplace.changes_requested",
        "kind": "system",
        "label": "Marketplace changes requested",
        "description": "Freelancer notified when the owner requests changes.",
        "title_template": "Changes requested",
        "body_template": "The owner requested changes on {listing}",
        "default_title_template": "Changes requested",
        "default_body_template": "The owner requested changes on {listing}",
        "variables": ["listing"],
        "email_enabled": False,
        "email_subject_template": "",
        "email_body_html_template": "",
    },
    {
        "trigger_key": "marketplace.payout",
        "kind": "system",
        "label": "Marketplace payout released",
        "description": "Freelancer notified when payment is released.",
        "title_template": "Payment released",
        "body_template": "You were paid {amount} for {listing}",
        "default_title_template": "Payment released",
        "default_body_template": "You were paid {amount} for {listing}",
        "variables": ["listing", "amount"],
        "email_enabled": True,
        "email_subject_template": "Payment released for {listing}",
        "email_body_html_template": "<p>You were paid {amount} for <b>{listing}</b>.</p>",
    },
    {
        "trigger_key": "marketplace.cancelled",
        "kind": "system",
        "label": "Marketplace contract cancelled",
        "description": "Freelancer notified when a contract is cancelled.",
        "title_template": "Contract cancelled",
        "body_template": "The contract for {listing} was cancelled",
        "default_title_template": "Contract cancelled",
        "default_body_template": "The contract for {listing} was cancelled",
        "variables": ["listing"],
        "email_enabled": False,
        "email_subject_template": "",
        "email_body_html_template": "",
    },
    {
        "trigger_key": "billing.topup_receipt",
        "kind": "system",
        "label": "Wallet top-up receipt",
        "description": "Workspace admins notified when wallet is topped up.",
        "title_template": "Wallet topped up",
        "body_template": "{amount} added to {workspace} wallet",
        "default_title_template": "Wallet topped up",
        "default_body_template": "{amount} added to {workspace} wallet",
        "variables": ["workspace", "amount"],
        "email_enabled": True,
        "email_subject_template": "Wallet topped up — {amount}",
        "email_body_html_template": "<p>{amount} was added to the <b>{workspace}</b> wallet.</p>",
    },
)


def upgrade() -> None:
    op.add_column(
        "notification_templates",
        sa.Column("email_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "notification_templates",
        sa.Column("email_subject_template", sa.Text(), nullable=False, server_default=""),
    )
    op.add_column(
        "notification_templates",
        sa.Column("email_body_html_template", sa.Text(), nullable=False, server_default=""),
    )
    op.alter_column("notification_templates", "email_enabled", server_default=None)
    op.alter_column("notification_templates", "email_subject_template", server_default=None)
    op.alter_column("notification_templates", "email_body_html_template", server_default=None)

    conn = op.get_bind()
    now = datetime.now(timezone.utc)
    for seed in _EMAIL_TEMPLATES:
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
    keys = ", ".join(f"'{t['trigger_key']}'" for t in _EMAIL_TEMPLATES)
    op.execute(sa.text(f"DELETE FROM notification_templates WHERE trigger_key IN ({keys})"))
    op.drop_column("notification_templates", "email_body_html_template")
    op.drop_column("notification_templates", "email_subject_template")
    op.drop_column("notification_templates", "email_enabled")
