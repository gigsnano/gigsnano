"""Meeting notetaker models (spec 2026-09-19)."""
import enum
from datetime import date, datetime

from sqlalchemy import (
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.core.db import TimestampedBase
from gigsnano_api.models.base import _values


class EMeetingPlatform(str, enum.Enum):
    GOOGLE_MEET = "google_meet"
    TEAMS = "teams"
    ZOOM = "zoom"


class EMeetingStatus(str, enum.Enum):
    REQUESTED = "requested"
    JOINING = "joining"
    WAITING_ADMISSION = "waiting_admission"
    IN_CALL = "in_call"
    ENDED = "ended"
    FAILED = "failed"


TERMINAL_MEETING_STATUSES = frozenset({EMeetingStatus.ENDED, EMeetingStatus.FAILED})
PRE_CALL_MEETING_STATUSES = frozenset(
    {EMeetingStatus.REQUESTED, EMeetingStatus.JOINING, EMeetingStatus.WAITING_ADMISSION}
)

NOTES_PENDING, NOTES_READY, NOTES_FAILED, NOTES_EMPTY = "pending", "ready", "failed", "empty"
ITEM_PENDING, ITEM_APPROVED, ITEM_DISMISSED = "pending", "approved", "dismissed"

MEETING_PLATFORM_ENUM = Enum(EMeetingPlatform, name="meeting_platform", values_callable=_values)
MEETING_STATUS_ENUM = Enum(EMeetingStatus, name="meeting_status", values_callable=_values)


class Meeting(TimestampedBase):
    __tablename__ = "meetings"
    __table_args__ = (Index("ix_meetings_project_created", "project_id", "created_at"),)

    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)
    title: Mapped[str] = mapped_column(String(200))
    platform: Mapped[EMeetingPlatform] = mapped_column(MEETING_PLATFORM_ENUM)
    meeting_url: Mapped[str] = mapped_column(Text)
    native_meeting_id: Mapped[str] = mapped_column(String(255))
    passcode: Mapped[str | None] = mapped_column(String(255), default=None)
    status: Mapped[EMeetingStatus] = mapped_column(MEETING_STATUS_ENUM, default=EMeetingStatus.REQUESTED, index=True)
    failure_reason: Mapped[str | None] = mapped_column(String(255), default=None)
    bot_external_id: Mapped[str | None] = mapped_column(String(255), default=None)
    consent_acknowledged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    summary: Mapped[str | None] = mapped_column(Text, default=None)
    notes_status: Mapped[str | None] = mapped_column(String(20), default=None, index=True)


class MeetingTranscriptSegment(TimestampedBase):
    __tablename__ = "meeting_transcript_segments"
    __table_args__ = (UniqueConstraint("meeting_id", "seq", name="uq_meeting_segment_seq"),)

    meeting_id: Mapped[str] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), index=True)
    seq: Mapped[int] = mapped_column(Integer)
    speaker: Mapped[str | None] = mapped_column(String(255), default=None)
    text: Mapped[str] = mapped_column(Text, default="")
    start_ms: Mapped[int] = mapped_column(Integer, default=0)
    end_ms: Mapped[int] = mapped_column(Integer, default=0)


class MeetingActionItem(TimestampedBase):
    __tablename__ = "meeting_action_items"

    meeting_id: Mapped[str] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(20), default=ITEM_PENDING)
    type: Mapped[str] = mapped_column(String(20), default="task")
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    quote: Mapped[str] = mapped_column(Text, default="")
    speaker_name: Mapped[str | None] = mapped_column(String(255), default=None)
    assignee_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)
    target_date: Mapped[date | None] = mapped_column(Date, default=None)
    created_story_id: Mapped[str | None] = mapped_column(ForeignKey("stories.id", ondelete="SET NULL"), default=None)
    decided_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    position: Mapped[int] = mapped_column(Integer, default=0)
