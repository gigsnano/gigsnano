"""meetings

Revision ID: c7a2e91f4d10
Revises: b5e1c93a7f04
Create Date: 2026-09-19

Meeting notetaker core (spec 2026-09-19). Three new tables: meetings,
meeting_transcript_segments, meeting_action_items. No data change — additive.

Hand-written: autogenerate runs against the shared prod DB and mixes in
unrelated pre-existing drift.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'c7a2e91f4d10'
down_revision: Union[str, Sequence[str], None] = 'b5e1c93a7f04'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_PLATFORM = sa.Enum("google_meet", "teams", "zoom", name="meeting_platform")
_STATUS = sa.Enum(
    "requested", "joining", "waiting_admission", "in_call", "ended", "failed",
    name="meeting_status",
)

# Enum objects passed to create_table would emit CREATE TYPE a second time —
# the explicit create() below already made them. `create_type=False` columns
# reference the existing type instead (this is what took prod down once).
_PLATFORM_COL = postgresql.ENUM(
    "google_meet", "teams", "zoom", name="meeting_platform", create_type=False
)
_STATUS_COL = postgresql.ENUM(
    "requested", "joining", "waiting_admission", "in_call", "ended", "failed",
    name="meeting_status", create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    _PLATFORM.create(bind, checkfirst=True)
    _STATUS.create(bind, checkfirst=True)

    op.create_table(
        "meetings",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("created_by_id", sa.String(length=36), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("platform", _PLATFORM_COL, nullable=False),
        sa.Column("meeting_url", sa.Text(), nullable=False),
        sa.Column("native_meeting_id", sa.String(length=255), nullable=False),
        sa.Column("passcode", sa.String(length=255), nullable=True),
        sa.Column("status", _STATUS_COL, nullable=False),
        sa.Column("failure_reason", sa.String(length=255), nullable=True),
        sa.Column("bot_external_id", sa.String(length=255), nullable=True),
        sa.Column("consent_acknowledged_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("notes_status", sa.String(length=20), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_meetings_project_created", "meetings", ["project_id", "created_at"])
    op.create_index(op.f("ix_meetings_workspace_id"), "meetings", ["workspace_id"])
    op.create_index(op.f("ix_meetings_project_id"), "meetings", ["project_id"])
    op.create_index(op.f("ix_meetings_status"), "meetings", ["status"])
    op.create_index(op.f("ix_meetings_notes_status"), "meetings", ["notes_status"])

    op.create_table(
        "meeting_transcript_segments",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("meeting_id", sa.String(length=36), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("speaker", sa.String(length=255), nullable=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("start_ms", sa.Integer(), nullable=False),
        sa.Column("end_ms", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["meeting_id"], ["meetings.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("meeting_id", "seq", name="uq_meeting_segment_seq"),
    )
    op.create_index(
        op.f("ix_meeting_transcript_segments_meeting_id"),
        "meeting_transcript_segments", ["meeting_id"],
    )

    op.create_table(
        "meeting_action_items",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("meeting_id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("type", sa.String(length=20), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("quote", sa.Text(), nullable=False),
        sa.Column("speaker_name", sa.String(length=255), nullable=True),
        sa.Column("assignee_id", sa.String(length=36), nullable=True),
        sa.Column("target_date", sa.Date(), nullable=True),
        sa.Column("created_story_id", sa.String(length=36), nullable=True),
        sa.Column("decided_by_id", sa.String(length=36), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["meeting_id"], ["meetings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["assignee_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_story_id"], ["stories.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["decided_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_meeting_action_items_meeting_id"), "meeting_action_items", ["meeting_id"]
    )
    op.create_index(
        op.f("ix_meeting_action_items_project_id"), "meeting_action_items", ["project_id"]
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_meeting_action_items_project_id"), table_name="meeting_action_items")
    op.drop_index(op.f("ix_meeting_action_items_meeting_id"), table_name="meeting_action_items")
    op.drop_table("meeting_action_items")
    op.drop_index(
        op.f("ix_meeting_transcript_segments_meeting_id"), table_name="meeting_transcript_segments"
    )
    op.drop_table("meeting_transcript_segments")
    op.drop_index(op.f("ix_meetings_notes_status"), table_name="meetings")
    op.drop_index(op.f("ix_meetings_status"), table_name="meetings")
    op.drop_index(op.f("ix_meetings_project_id"), table_name="meetings")
    op.drop_index(op.f("ix_meetings_workspace_id"), table_name="meetings")
    op.drop_index("ix_meetings_project_created", table_name="meetings")
    op.drop_table("meetings")
    bind = op.get_bind()
    _STATUS.drop(bind, checkfirst=True)
    _PLATFORM.drop(bind, checkfirst=True)
