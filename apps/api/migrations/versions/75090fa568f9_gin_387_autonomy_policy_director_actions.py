"""GIN-387: project autonomy policy + the director action audit log.

Two tables, no data change. A project with no policy row is treated as the
conservative defaults in code, so nothing needs backfilling.

NOTE: written by hand from the autogenerate output. Autogenerate (run against the
shared prod DB) also proposed unrelated index/constraint churn that predates this
change — dropping it here on purpose; it is not this migration's business.

Revision ID: 75090fa568f9
Revises: e5c1a9d7b204
Create Date: 2026-07-22
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "75090fa568f9"
down_revision = "e5c1a9d7b204"
branch_labels = None
depends_on = None

_ACTION = sa.Enum(
    "assign_module", "assign_cycle", "assign_owner", "change_priority", "change_status",
    "shift_dates", "create_work_item", "create_relation", "repair_work_item",
    "remove_committed_scope", "change_committed_deadline", "change_budget",
    "approve_release", "override_gate", "release_payment", "change_expert_engagement",
    "change_kpi_definition", name="director_action",
)
_STATUS = sa.Enum(
    "pending", "approved", "rejected", "auto_approved", "executed", "failed",
    "rolled_back", name="director_action_status",
)


def upgrade() -> None:
    _ACTION.create(op.get_bind(), checkfirst=True)
    _STATUS.create(op.get_bind(), checkfirst=True)
    op.create_table('project_autonomy_policies',
    sa.Column('project_id', sa.String(length=36), nullable=False),
    sa.Column('paused', sa.Boolean(), nullable=False),
    sa.Column('paused_reason', sa.Text(), nullable=False),
    sa.Column('paused_by_id', sa.String(length=36), nullable=True),
    sa.Column('paused_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('max_items_per_run', sa.Integer(), nullable=False),
    sa.Column('max_date_shift_days', sa.Integer(), nullable=False),
    sa.Column('max_priority_changes', sa.Integer(), nullable=False),
    sa.Column('max_reassignments', sa.Integer(), nullable=False),
    sa.Column('allowed_status_transitions', sa.JSON(none_as_null=True).with_variant(postgresql.JSONB(none_as_null=True, astext_type=sa.Text()), 'postgresql'), nullable=True),
    sa.Column('restricted_actions', sa.JSON(none_as_null=True).with_variant(postgresql.JSONB(none_as_null=True, astext_type=sa.Text()), 'postgresql'), nullable=True),
    sa.Column('quiet_hours_start', sa.Integer(), nullable=True),
    sa.Column('quiet_hours_end', sa.Integer(), nullable=True),
    sa.Column('quiet_hours_timezone', sa.String(length=64), nullable=False),
    sa.Column('notification_channels', sa.JSON(none_as_null=True).with_variant(postgresql.JSONB(none_as_null=True, astext_type=sa.Text()), 'postgresql'), nullable=True),
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['paused_by_id'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_project_autonomy_policies_project_id'), 'project_autonomy_policies', ['project_id'], unique=True)
    op.create_table('project_director_actions',
    sa.Column('project_id', sa.String(length=36), nullable=False),
    sa.Column('action', postgresql.ENUM('assign_module', 'assign_cycle', 'assign_owner', 'change_priority', 'change_status', 'shift_dates', 'create_work_item', 'create_relation', 'repair_work_item', 'remove_committed_scope', 'change_committed_deadline', 'change_budget', 'approve_release', 'override_gate', 'release_payment', 'change_expert_engagement', 'change_kpi_definition', name='director_action', create_type=False), nullable=False),
    sa.Column('status', postgresql.ENUM('pending', 'approved', 'rejected', 'auto_approved', 'executed', 'failed', 'rolled_back', name='director_action_status', create_type=False), nullable=False),
    sa.Column('payload', sa.JSON(none_as_null=True).with_variant(postgresql.JSONB(none_as_null=True, astext_type=sa.Text()), 'postgresql'), nullable=True),
    sa.Column('reason', sa.Text(), nullable=False),
    sa.Column('policy_reason', sa.Text(), nullable=False),
    sa.Column('requested_by_id', sa.String(length=36), nullable=True),
    sa.Column('requested_by_name', sa.String(length=120), nullable=False),
    sa.Column('decided_by_id', sa.String(length=36), nullable=True),
    sa.Column('decided_by_name', sa.String(length=120), nullable=True),
    sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('decision_note', sa.Text(), nullable=False),
    sa.Column('correlation_id', sa.String(length=64), nullable=True),
    sa.Column('result', sa.JSON(none_as_null=True).with_variant(postgresql.JSONB(none_as_null=True, astext_type=sa.Text()), 'postgresql'), nullable=True),
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['decided_by_id'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['requested_by_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_project_director_actions_correlation_id'), 'project_director_actions', ['correlation_id'], unique=False)
    op.create_index(op.f('ix_project_director_actions_project_id'), 'project_director_actions', ['project_id'], unique=False)
    op.create_index(op.f('ix_project_director_actions_status'), 'project_director_actions', ['status'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_project_director_actions_status"), table_name="project_director_actions")
    op.drop_index(
        op.f("ix_project_director_actions_project_id"), table_name="project_director_actions"
    )
    op.drop_index(
        op.f("ix_project_director_actions_correlation_id"), table_name="project_director_actions"
    )
    op.drop_table("project_director_actions")
    op.drop_index(
        op.f("ix_project_autonomy_policies_project_id"), table_name="project_autonomy_policies"
    )
    op.drop_table("project_autonomy_policies")
    _STATUS.drop(op.get_bind(), checkfirst=True)
    _ACTION.drop(op.get_bind(), checkfirst=True)
