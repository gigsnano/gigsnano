"""Post-meeting notes (spec piece 2): one structured LLM call → summary +
pending action items. Mirrors features/roadmap/drafter.py:_draft."""
import asyncio
import logging
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.models import User
from gigsnano_api.bmad.provider import LLMProvider
from gigsnano_api.core.db import utcnow
from gigsnano_api.features.meetings.service import _aware, list_segments
from gigsnano_api.features.notifications.router import notify
from gigsnano_api.features.voice.resolver import rank, resolve_date
from gigsnano_api.models import EMemberStatus, ENotificationKind, ProjectMember, Workspace
from gigsnano_api.models.meetings import (
    ITEM_PENDING,
    NOTES_EMPTY,
    NOTES_FAILED,
    NOTES_READY,
    Meeting,
    MeetingActionItem,
)
from gigsnano_api.voice.commands import EFieldState

logger = logging.getLogger("gigsnano.meetings")
MAX_TRANSCRIPT_CHARS = 120_000
_MAX_ATTEMPTS = 3
_EXTRACTION_TIMEOUT = 90
_TOOL = "emit_meeting_notes"
_SYSTEM = [{"type": "text", "text": (
    "You are the meeting notetaker for a software project team. From the transcript, write a "
    "concise markdown summary (decisions, open questions, key discussion — at most 10 bullets) "
    "and extract every concrete action item someone committed to or was asked to do. For each "
    "item: a short imperative title; a one-to-three sentence description; type = 'feature' for "
    "a new user-facing capability, 'bug' for something broken, 'story' for a user-facing slice of "
    "existing work, otherwise 'task'; assignee_name exactly as said in the meeting (or null); "
    "due as an English date phrase such as 'Friday' or 'next week' (or null); quote = the "
    "sentence that created the item, verbatim in the language it was spoken. Participants may "
    "speak any language or mix languages: always write the summary, titles and descriptions in "
    "English, translating as needed. Never invent items; no duplicates; at most 25."
)}]


class ExtractedActionItem(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    type: Literal["task", "feature", "bug", "story"] = "task"
    assignee_name: str | None = None
    due: str | None = None
    quote: str = ""


class MeetingNotesDraft(BaseModel):
    summary: str = ""
    action_items: list[ExtractedActionItem] = Field(default_factory=list, max_length=25)


def _mmss(ms: int) -> str:
    seconds = ms // 1000
    return f"{seconds // 60:02d}:{seconds % 60:02d}"


def transcript_text(segments) -> str:
    text = "\n".join(f"[{_mmss(s.start_ms)}] {s.speaker or 'Unknown'}: {s.text}" for s in segments)
    return text[:MAX_TRANSCRIPT_CHARS]


async def extract_notes(provider: LLMProvider, title: str, transcript: str) -> MeetingNotesDraft:
    messages = [{"role": "user", "content": f"Meeting: {title}\n\nTranscript:\n{transcript}"}]
    for _ in range(_MAX_ATTEMPTS):
        result = await provider.extract(system=_SYSTEM, messages=messages, tool_name=_TOOL,
                                        schema=MeetingNotesDraft.model_json_schema())
        try:
            return MeetingNotesDraft.model_validate(result.data)
        except ValidationError as err:
            messages = messages + [
                {"role": "assistant", "content": f"{_TOOL} was invalid."},
                {"role": "user", "content": f"Failed validation:\n{err}\nEmit again, fixed."},
            ]
    raise ValueError("meeting notes failed validation")


def _match_assignee(name: str | None, members: list[tuple[str, str]]) -> str | None:
    if not name or not members:
        return None
    field = rank(name, members)
    return field.value if field.state is EFieldState.RESOLVED else None


def _due(phrase: str | None, now: datetime) -> date | None:
    if not phrase:
        return None
    field = resolve_date(phrase, now=now)
    return date.fromisoformat(field.value) if field.state is EFieldState.RESOLVED and field.value else None


async def generate_notes(db: AsyncSession, meeting: Meeting, provider: LLMProvider, *,
                         now: datetime | None = None) -> None:
    segments = await list_segments(db, meeting.id)
    if not segments:
        meeting.notes_status = NOTES_EMPTY
        await db.flush()
        return
    try:
        draft = await asyncio.wait_for(
            extract_notes(provider, meeting.title, transcript_text(segments)), timeout=_EXTRACTION_TIMEOUT)
    except Exception:  # noqa: BLE001 — surfaced to the user as notes_status=failed
        logger.exception("meeting notes extraction failed meeting=%s", meeting.id)
        meeting.notes_status = NOTES_FAILED
        await db.flush()
        return

    meeting_id = meeting.id
    try:
        members = [(uid, name) for uid, name in (await db.execute(
            select(User.id, User.display_name).join(ProjectMember, ProjectMember.user_id == User.id)
            .where(ProjectMember.project_id == meeting.project_id, ProjectMember.status == EMemberStatus.ACTIVE)
        )).all()]
        # Position continues from the highest position ever assigned (including the
        # pending rows about to be replaced), so a regenerate never reuses a position
        # a decided (approved/dismissed) item already holds.
        start = (await db.scalar(select(func.max(MeetingActionItem.position))
                                 .where(MeetingActionItem.meeting_id == meeting.id)))
        await db.execute(delete(MeetingActionItem).where(
            MeetingActionItem.meeting_id == meeting.id, MeetingActionItem.status == ITEM_PENDING))
        position = 0 if start is None else start + 1
        anchor = _aware(meeting.ended_at) if meeting.ended_at else (now or utcnow())
        for item in draft.action_items:
            db.add(MeetingActionItem(
                meeting_id=meeting.id, project_id=meeting.project_id, status=ITEM_PENDING, type=item.type,
                title=item.title.strip()[:200], description=item.description.strip(), quote=item.quote.strip(),
                speaker_name=item.assignee_name, assignee_id=_match_assignee(item.assignee_name, members),
                target_date=_due(item.due, anchor), position=position,
            ))
            position += 1
        meeting.summary = draft.summary.strip() or None
        meeting.notes_status = NOTES_READY
        if draft.action_items and meeting.created_by_id:
            workspace = await db.get(Workspace, meeting.workspace_id)
            await notify(db, meeting.workspace_id, receiver_id=meeting.created_by_id,
                         kind=ENotificationKind.REVIEW, title="Action items ready for review",
                         body=f"{len(draft.action_items)} action items from {meeting.title}",
                         href=f"/{workspace.slug}/projects/{meeting.project_id}/meetings/{meeting.id}",
                         project_id=meeting.project_id)
        await db.flush()
    except Exception:  # noqa: BLE001 — a post-extraction failure must not leave
        # notes_status stuck on "pending" forever (the sweep would re-call the
        # LLM every tick). Discard whatever this attempt staged — the rollback
        # also undoes the pending-item delete above so a retry starts clean —
        # then mark the meeting failed in a fresh transaction and stop; we do
        # not re-raise, so the caller's own commit has nothing left to do.
        logger.exception("meeting notes post-processing failed meeting=%s", meeting_id)
        await db.rollback()
        meeting = await db.get(Meeting, meeting_id)
        meeting.notes_status = NOTES_FAILED
        await db.flush()
