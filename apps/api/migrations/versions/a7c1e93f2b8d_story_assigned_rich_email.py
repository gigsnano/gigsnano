"""story.assigned: Jira-style rich email (coded subject + card body).

Revision ID: a7c1e93f2b8d
Revises: 2413858a50d3
Create Date: 2026-07-15
"""

import json

import sqlalchemy as sa
from alembic import op

revision = "a7c1e93f2b8d"
down_revision = "2413858a50d3"
branch_labels = None
depends_on = None

_SUBJECT = "[{code}] {actor} assigned {story} to you"

# Rendered inside email_shell()'s white card. `{url}` is injected by resolve_and_notify.
_BODY = (
    '<p style="margin:0 0 20px;color:#42526e;font-size:14px">'
    "{actor} assigned this work item to you</p>"
    '<div style="font-size:12px;color:#6b778c;margin:0 0 6px">{project} &middot; {code}</div>'
    '<a href="{url}" style="font-size:18px;font-weight:600;color:#4f46e5;'
    'text-decoration:none">{story}</a>'
    '<div style="margin:20px 0;color:#42526e;font-size:14px">Assignee: <b>you</b></div>'
    '<a href="{url}" style="display:inline-block;background:#4f46e5;color:#fff;'
    'text-decoration:none;padding:9px 18px;border-radius:6px;font-size:14px;'
    'font-weight:500">View work item</a>'
)
_VARIABLES = ["actor", "project", "story", "code", "url"]

# Prior values (for downgrade).
_OLD_SUBJECT = "{story}"
_OLD_BODY = "<p>{actor} assigned you to <b>{story}</b> in {project}.</p>"
_OLD_VARIABLES = ["actor", "project", "story"]


def _set(subject: str, body: str, variables: list[str]) -> None:
    op.get_bind().execute(
        sa.text(
            "UPDATE notification_templates SET email_subject_template=:s, "
            "email_body_html_template=:b, variables=CAST(:v AS json) "
            "WHERE trigger_key='story.assigned'"
        ),
        {"s": subject, "b": body, "v": json.dumps(variables)},
    )


def upgrade() -> None:
    _set(_SUBJECT, _BODY, _VARIABLES)


def downgrade() -> None:
    _set(_OLD_SUBJECT, _OLD_BODY, _OLD_VARIABLES)
