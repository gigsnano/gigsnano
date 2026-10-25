"""GIN-386: project risks, decisions and escalations.

Three tables, no data change — these were previously carried in prose (a status
update, a Slack thread), which is why they went stale silently.

Hand-written: autogenerate runs against the shared prod DB and mixes in unrelated
pre-existing drift.

Revision ID: d6b4a8f13c07
Revises: a1f7c3e29d84
Create Date: 2026-07-22
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "d6b4a8f13c07"
down_revision = "a1f7c3e29d84"
branch_labels = None
depends_on = None

_RISK_STATUS = sa.Enum("open", "mitigating", "closed", "occurred", name="risk_status")
_RISK_CATEGORY = sa.Enum(
    "delivery", "technical", "resource", "external", "security", "compliance",
    "budget", "scope", name="risk_category",
)
_DECISION_STATUS = sa.Enum("open", "resolved", "deferred", name="decision_status")
_ESCALATION_STATUS = sa.Enum("open", "acknowledged", "resolved", name="escalation_status")
_ESCALATION_CATEGORY = sa.Enum(
    "access", "vendor", "approval", "security", "budget", "scope", "staffing",
    "external_dependency", name="escalation_category",
)

_JSON = sa.JSON(none_as_null=True).with_variant(
    postgresql.JSONB(none_as_null=True), "postgresql"
)


# Enum objects passed to create_table would emit CREATE TYPE a second time —
# the explicit create() below already made them. `create_type=False` columns
# reference the existing type instead (this is what took prod down once).
_RISK_STATUS_COL = postgresql.ENUM(
    "open", "mitigating", "closed", "occurred", name="risk_status", create_type=False
)
_RISK_CATEGORY_COL = postgresql.ENUM(
    
    "delivery", "technical", "resource", "external", "security", "compliance",
    "budget", "scope", name="risk_category", create_type=False
)
_DECISION_STATUS_COL = postgresql.ENUM(
    "open", "resolved", "deferred", name="decision_status", create_type=False
)
_ESCALATION_STATUS_COL = postgresql.ENUM(
    "open", "acknowledged", "resolved", name="escalation_status", create_type=False
)
_ESCALATION_CATEGORY_COL = postgresql.ENUM(
    
    "access", "vendor", "approval", "security", "budget", "scope", "staffing",
    "external_dependency", name="escalation_category", create_type=False
)


def upgrade() -> None:
    bind = op.get_bind()
    for enum in (_RISK_STATUS, _RISK_CATEGORY, _DECISION_STATUS,
                 _ESCALATION_STATUS, _ESCALATION_CATEGORY):
        enum.create(bind, checkfirst=True)

    op.create_table(
        "project_risks",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("category", _RISK_CATEGORY_COL, nullable=False),
        sa.Column("status", _RISK_STATUS_COL, nullable=False),
        sa.Column("probability", sa.Integer(), nullable=False),
        sa.Column("impact", sa.Integer(), nullable=False),
        sa.Column("exposure", sa.Integer(), nullable=False),
        sa.Column("owner_id", sa.String(length=36), nullable=True),
        sa.Column("mitigation", sa.Text(), nullable=False),
        sa.Column("contingency", sa.Text(), nullable=False),
        sa.Column("trigger", sa.Text(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("affected_work_item_codes", _JSON, nullable=True),
        sa.Column("affected_milestone_ids", _JSON, nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_by_id", sa.String(length=36), nullable=True),
        sa.Column("closure_note", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["closed_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_project_risks_project_id"), "project_risks", ["project_id"])
    op.create_index(op.f("ix_project_risks_status"), "project_risks", ["status"])

    op.create_table(
        "project_decisions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("question", sa.String(length=500), nullable=False),
        sa.Column("context", sa.Text(), nullable=False),
        sa.Column("options", _JSON, nullable=True),
        sa.Column("recommended_option", sa.String(length=120), nullable=True),
        sa.Column("rationale", sa.Text(), nullable=False),
        sa.Column("evidence", sa.Text(), nullable=False),
        sa.Column("impact_of_delay", sa.Text(), nullable=False),
        sa.Column("status", _DECISION_STATUS_COL, nullable=False),
        sa.Column("owner_id", sa.String(length=36), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("selected_option", sa.String(length=120), nullable=True),
        sa.Column("decided_by_id", sa.String(length=36), nullable=True),
        sa.Column("decided_by_name", sa.String(length=120), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decision_note", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["decided_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_project_decisions_project_id"), "project_decisions", ["project_id"])
    op.create_index(op.f("ix_project_decisions_status"), "project_decisions", ["status"])

    op.create_table(
        "project_escalations",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("category", _ESCALATION_CATEGORY_COL, nullable=False),
        sa.Column("status", _ESCALATION_STATUS_COL, nullable=False),
        sa.Column("raised_to", sa.String(length=200), nullable=False),
        sa.Column("raised_by_id", sa.String(length=36), nullable=True),
        sa.Column("raised_by_name", sa.String(length=120), nullable=False),
        sa.Column("needed_by", sa.Date(), nullable=True),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolution", sa.Text(), nullable=False),
        sa.Column("blocker_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["raised_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["blocker_id"], ["work_item_blockers.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_project_escalations_project_id"), "project_escalations", ["project_id"]
    )
    op.create_index(op.f("ix_project_escalations_status"), "project_escalations", ["status"])


def downgrade() -> None:
    op.drop_index(op.f("ix_project_escalations_status"), table_name="project_escalations")
    op.drop_index(op.f("ix_project_escalations_project_id"), table_name="project_escalations")
    op.drop_table("project_escalations")
    op.drop_index(op.f("ix_project_decisions_status"), table_name="project_decisions")
    op.drop_index(op.f("ix_project_decisions_project_id"), table_name="project_decisions")
    op.drop_table("project_decisions")
    op.drop_index(op.f("ix_project_risks_status"), table_name="project_risks")
    op.drop_index(op.f("ix_project_risks_project_id"), table_name="project_risks")
    op.drop_table("project_risks")
    bind = op.get_bind()
    for enum in (_ESCALATION_CATEGORY, _ESCALATION_STATUS, _DECISION_STATUS,
                 _RISK_CATEGORY, _RISK_STATUS):
        enum.drop(bind, checkfirst=True)
