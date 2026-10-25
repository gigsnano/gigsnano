"""digest deliveries: keep what was sent (ai_summary, body_html).

A digest is a point-in-time snapshot — the stories move on, so what went out on
a given day can't be recomputed from them afterwards. Keeping it on the delivery
row rather than in the log: logs are unstructured, get shipped to aggregators and
rotate away, which is a poor home for the contents of someone's mail.

Additive and nullable, unlike d1a7c3e9f5b2 — old and new code both run against
this schema, so there's no deploy-ordering hazard.

Revision ID: e2b8d4f1a6c3
Revises: d1a7c3e9f5b2
Create Date: 2026-07-16
"""

import sqlalchemy as sa
from alembic import op

revision = "e2b8d4f1a6c3"
down_revision = "d1a7c3e9f5b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("digest_deliveries", sa.Column("ai_summary", sa.Text(), nullable=True))
    op.add_column("digest_deliveries", sa.Column("body_html", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("digest_deliveries", "body_html")
    op.drop_column("digest_deliveries", "ai_summary")
