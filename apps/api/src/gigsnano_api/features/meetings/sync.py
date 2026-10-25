"""Meeting sync loop (spec 2026-09-19): converge live meetings onto the bot
provider every `meetings_poll_seconds`. Single replica, in-process — same
pattern as features/forecasting/scheduler.py."""
import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.config import settings
from gigsnano_api.core.db import async_session, utcnow
from gigsnano_api.features.meetings.notes import generate_notes
from gigsnano_api.features.meetings.service import apply_bot_state, expire_if_unadmitted
from gigsnano_api.meetings.provider import MeetingBotError, MeetingBotProvider
from gigsnano_api.models.meetings import NOTES_PENDING, TERMINAL_MEETING_STATUSES, Meeting

logger = logging.getLogger("gigsnano.meetings")


@asynccontextmanager
async def _session(db: AsyncSession | None):
    """Injected session (tests) or the module session (prod) — async_session()
    ignores the get_db override, so tests always pass `db`."""
    if db is not None:
        yield db
        return
    async with async_session() as owned:
        yield owned


async def sync_meeting(db: AsyncSession, provider: MeetingBotProvider, meeting: Meeting, now: datetime) -> None:
    if expire_if_unadmitted(meeting, now):
        try:
            await provider.stop_bot(platform=meeting.platform, native_meeting_id=meeting.native_meeting_id)
        except MeetingBotError:
            logger.warning("could not stop unadmitted bot meeting=%s", meeting.id)
        return
    state = await provider.get_state(platform=meeting.platform, native_meeting_id=meeting.native_meeting_id)
    await apply_bot_state(db, meeting, state, now)


async def sweep(provider: MeetingBotProvider, llm=None, *, db: AsyncSession | None = None,
                now: datetime | None = None) -> None:
    now = now or utcnow()
    async with _session(db) as session:
        meeting_ids = (await session.execute(
            select(Meeting.id).where(Meeting.status.not_in(list(TERMINAL_MEETING_STATUSES))))).scalars().all()
        for meeting_id in meeting_ids:
            # Re-select (not identity-map reuse): session.rollback() expires every
            # object in the session, and a prior meeting's failure must not leave
            # this one's attributes stuck behind an un-awaited lazy reload.
            try:
                meeting = (await session.execute(
                    select(Meeting).where(Meeting.id == meeting_id))).scalar_one_or_none()
                if meeting is None:
                    continue
                await sync_meeting(session, provider, meeting, now)
                await session.commit()
            except Exception:  # noqa: BLE001 — one meeting must not sink the sweep
                await session.rollback()
                logger.exception("meeting sync failed meeting=%s", meeting_id)

        if llm is not None:
            pending_ids = (await session.execute(
                select(Meeting.id).where(Meeting.notes_status == NOTES_PENDING)
                .order_by(Meeting.ended_at).limit(2))).scalars().all()
            for meeting_id in pending_ids:
                try:
                    meeting = (await session.execute(
                        select(Meeting).where(Meeting.id == meeting_id))).scalar_one_or_none()
                    if meeting is None:
                        continue
                    await generate_notes(session, meeting, llm)
                    await session.commit()
                except Exception:  # noqa: BLE001
                    await session.rollback()
                    logger.exception("meeting notes failed meeting=%s", meeting_id)


async def meetings_sync_loop(provider: MeetingBotProvider, llm=None) -> None:
    logger.info("meetings sync loop started (interval=%ss)", settings.meetings_poll_seconds)
    while True:
        await asyncio.sleep(settings.meetings_poll_seconds)
        try:
            await sweep(provider, llm)
        except Exception:  # noqa: BLE001 — a bad tick must not end the loop
            logger.exception("meetings sweep failed — loop continuing")
