import logging
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.models import User
from gigsnano_api.core.db import utcnow
from gigsnano_api.features.meetings.links import ParsedLink
from gigsnano_api.features.meetings.schemas import MeetingOut
from gigsnano_api.meetings.provider import BotState, MeetingBotError, MeetingBotProvider
from gigsnano_api.models import Project
from gigsnano_api.models.meetings import (
    ITEM_PENDING,
    NOTES_PENDING,
    PRE_CALL_MEETING_STATUSES,
    TERMINAL_MEETING_STATUSES,
    EMeetingPlatform,
    EMeetingStatus,
    Meeting,
    MeetingActionItem,
    MeetingTranscriptSegment,
)

logger = logging.getLogger("gigsnano.meetings")

PLATFORM_LABELS = {EMeetingPlatform.GOOGLE_MEET: "Google Meet", EMeetingPlatform.TEAMS: "Teams",
                   EMeetingPlatform.ZOOM: "Zoom"}
ADMISSION_TIMEOUT = timedelta(minutes=20)
NOT_ADMITTED = "Bot was not admitted"
SERVICE_DOWN = "Notetaker service unavailable"


def _aware(value: datetime) -> datetime:
    # SQLite (tests) hands back naive datetimes; Postgres returns aware ones.
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _end(meeting: Meeting, now: datetime, final: EMeetingStatus, reason: str | None = None) -> None:
    meeting.status = final
    meeting.ended_at = meeting.ended_at or now
    if final is EMeetingStatus.FAILED:
        meeting.failure_reason = reason or "The notetaker could not stay in the meeting."
    else:
        meeting.notes_status = NOTES_PENDING


async def create_meeting(db: AsyncSession, project: Project, user: User, *, parsed: ParsedLink,
                         title: str | None, provider: MeetingBotProvider,
                         bot_name: str) -> Meeting:
    now = utcnow()
    meeting = Meeting(
        workspace_id=project.workspace_id, project_id=project.id, created_by_id=user.id,
        title=(title or "").strip() or f"{PLATFORM_LABELS[parsed.platform]} meeting",
        platform=parsed.platform, meeting_url=parsed.canonical_url,
        native_meeting_id=parsed.native_meeting_id, passcode=parsed.passcode,
        status=EMeetingStatus.REQUESTED, consent_acknowledged_at=now,
    )
    db.add(meeting)
    await db.flush()
    try:
        handle = await provider.start_bot(platform=parsed.platform, native_meeting_id=parsed.native_meeting_id,
                                          passcode=parsed.passcode, bot_name=bot_name)
        meeting.bot_external_id = handle.external_id
        meeting.status = EMeetingStatus.JOINING
    except MeetingBotError:
        _end(meeting, now, EMeetingStatus.FAILED, SERVICE_DOWN)
    await db.commit()
    await db.refresh(meeting)
    return meeting


async def get_meeting(db: AsyncSession, project: Project, meeting_id: str) -> Meeting:
    meeting = await db.get(Meeting, meeting_id)
    if meeting is None or meeting.project_id != project.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Meeting not found")
    return meeting


async def list_meetings(db: AsyncSession, project: Project) -> list[Meeting]:
    rows = await db.execute(select(Meeting).where(Meeting.project_id == project.id)
                            .order_by(Meeting.created_at.desc()))
    return list(rows.scalars())


async def list_segments(db: AsyncSession, meeting_id: str) -> list[MeetingTranscriptSegment]:
    rows = await db.execute(select(MeetingTranscriptSegment)
                            .where(MeetingTranscriptSegment.meeting_id == meeting_id)
                            .order_by(MeetingTranscriptSegment.seq))
    return list(rows.scalars())


async def pending_counts(db: AsyncSession, meeting_ids: list[str]) -> dict[str, int]:
    if not meeting_ids:
        return {}
    rows = await db.execute(
        select(MeetingActionItem.meeting_id, func.count())
        .where(MeetingActionItem.meeting_id.in_(meeting_ids), MeetingActionItem.status == ITEM_PENDING)
        .group_by(MeetingActionItem.meeting_id))
    return {mid: count for mid, count in rows.all()}


def meeting_out(meeting: Meeting, pending: int = 0) -> MeetingOut:
    return MeetingOut(
        id=meeting.id, project_id=meeting.project_id, title=meeting.title, platform=meeting.platform,
        meeting_url=meeting.meeting_url, status=meeting.status, failure_reason=meeting.failure_reason,
        started_at=meeting.started_at, ended_at=meeting.ended_at, created_at=meeting.created_at,
        created_by_id=meeting.created_by_id, summary=meeting.summary, notes_status=meeting.notes_status,
        pending_action_items=pending,
    )


async def apply_bot_state(db: AsyncSession, meeting: Meeting, state: BotState, now: datetime) -> None:
    """Converge the stored meeting onto the provider's view. Terminal is sticky.
    The provider returns the full segment list each time, so rows are upserted by
    seq and trailing rows the provider no longer reports are removed."""
    if meeting.status in TERMINAL_MEETING_STATUSES:
        return
    if state.segments:
        existing = {s.seq: s for s in await list_segments(db, meeting.id)}
        for seg in state.segments:
            row = existing.pop(seg.seq, None)
            if row is None:
                db.add(MeetingTranscriptSegment(meeting_id=meeting.id, seq=seg.seq, speaker=seg.speaker,
                                                text=seg.text, start_ms=seg.start_ms, end_ms=seg.end_ms))
            else:
                row.speaker, row.text, row.start_ms, row.end_ms = seg.speaker, seg.text, seg.start_ms, seg.end_ms
        for stale in existing.values():
            await db.delete(stale)
    if state.status is EMeetingStatus.IN_CALL and meeting.started_at is None:
        meeting.started_at = now
    if state.status is None:
        pass  # provider reported a status we don't recognise — leave meeting.status as-is
    elif state.status in TERMINAL_MEETING_STATUSES:
        _end(meeting, now, state.status, state.failure_reason)
    elif meeting.started_at is not None and state.status in PRE_CALL_MEETING_STATUSES:
        pass  # never regress an already-started meeting back to a pre-call status
    else:
        meeting.status = state.status
    await db.flush()


def expire_if_unadmitted(meeting: Meeting, now: datetime) -> bool:
    if (meeting.started_at is None and meeting.status in PRE_CALL_MEETING_STATUSES
            and now - _aware(meeting.created_at) > ADMISSION_TIMEOUT):
        _end(meeting, now, EMeetingStatus.FAILED, NOT_ADMITTED)
        return True
    return False


async def stop_meeting(db: AsyncSession, meeting: Meeting, provider: MeetingBotProvider | None) -> Meeting:
    if meeting.status in TERMINAL_MEETING_STATUSES:
        return meeting
    now = utcnow()
    if provider is not None:
        try:
            state = await provider.get_state(platform=meeting.platform,
                                              native_meeting_id=meeting.native_meeting_id)
            await apply_bot_state(db, meeting, state, now)
        except MeetingBotError:
            pass  # best effort: the meeting is ended on our side regardless
        try:
            await provider.stop_bot(platform=meeting.platform, native_meeting_id=meeting.native_meeting_id)
        except MeetingBotError:
            logger.warning("could not stop bot on meeting stop meeting=%s", meeting.id)
    if meeting.status not in TERMINAL_MEETING_STATUSES:
        _end(meeting, now, EMeetingStatus.ENDED)
    await db.commit()
    await db.refresh(meeting)
    return meeting
