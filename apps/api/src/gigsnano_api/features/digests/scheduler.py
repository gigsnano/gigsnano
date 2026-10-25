"""In-process digest scheduler (GIN-103, per-user timing in GIN-125).

A single asyncio task started from the app lifespan (single-replica deploy). It
ticks every 15 minutes and asks, per user, "is your local delivery time here
yet?" — so a user in Kolkata at 09:00 and one in Denver at 07:00 each get their
digest at their own hour, from the same loop.

Why 15 minutes and not hourly: UTC offsets are not all whole hours. Kolkata is
+05:30, Kathmandu +05:45, Chatham +12:45. On an hourly tick those users' chosen
hour never coincides with a tick and they'd be served up to 45 minutes late.
Every real-world offset is a multiple of 15 minutes, so a quarter-hour tick can
land on any user's hour exactly.

Delivery is idempotent per (user, workspace, local date), so a restart mid-day
never double-sends, and `digest_due_date` is catch-up rather than exact-match, so
a missed tick never drops a day either. For a manual/external-cron trigger use
`POST .../digests/run/`, which forces one date for everyone.
"""

import asyncio
import logging
from datetime import datetime

from sqlalchemy import select

from gigsnano_api.core.db import async_session, utcnow
from gigsnano_api.email.provider import EmailProvider
from gigsnano_api.features.digests.service import (
    PendingDigestEmail,
    flush_digest_emails,
    run_workspace_digests,
)
from gigsnano_api.models import Workspace

logger = logging.getLogger("gigsnano.digests")

TICK_MINUTES = 15


def seconds_until_next_tick(now: datetime, minutes: int = TICK_MINUTES) -> float:
    """Seconds from `now` to the next wall-clock tick boundary (:00/:15/:30/:45).

    Aligning to the wall clock (rather than sleeping a flat interval from
    whenever we woke) keeps ticks on the quarter-hour even after a slow run, so
    they stay lined up with the offsets they exist to serve.
    """
    elapsed = (now.minute % minutes) * 60 + now.second + now.microsecond / 1_000_000
    return minutes * 60 - elapsed


async def _run_all_workspaces(
    provider: EmailProvider | None, llm_provider=None, now_utc: datetime | None = None
) -> None:
    now = now_utc or utcnow()
    async with async_session() as db:
        workspaces = (await db.execute(select(Workspace))).scalars().all()
        # Collected across every workspace, then sent as one email per user
        # (GIN-136). A user's workspaces are all processed in this same tick —
        # their digest hour is a per-user preference, not a per-workspace one —
        # so buffering within the loop is enough to catch all of them.
        pending: list[PendingDigestEmail] = []
        for ws in workspaces:
            try:
                result = await run_workspace_digests(
                    db,
                    ws,
                    provider=provider,
                    llm_provider=llm_provider,
                    now_utc=now,
                    email_sink=pending,
                )
                # Most ticks are a no-op for most workspaces (nobody's hour yet).
                # Logging those at 96 ticks/day would bury the real ones.
                if result.sent or result.failed:
                    logger.info(
                        "digest tick ws=%s sent=%d skipped=%d failed=%d",
                        ws.slug, result.sent, result.skipped, result.failed,
                    )
            except Exception:  # noqa: BLE001 — one workspace must not sink the tick
                logger.exception("digest run failed for ws=%s", ws.id)

        # After the loop: every delivery above is already committed by its own
        # run, so the rows these reference exist. The flush only adds body_html.
        try:
            if pending:
                await flush_digest_emails(pending, provider)
                await db.commit()
        except Exception:  # noqa: BLE001 — a failed send must not sink the tick
            logger.exception("digest email flush failed (%d pending)", len(pending))


async def digest_scheduler(provider: EmailProvider | None, llm_provider=None) -> None:
    """Tick loop. Cancelled on shutdown (asyncio.CancelledError propagates out).

    ponytail: scans every workspace's members each tick and skips on a cheap
    pref/date check. Fine at current scale (a few queries per member per tick).
    If that ever bites, the upgrade path is a SQL-side filter — index
    digest_preferences on (enabled, digest_hour) and select only the users whose
    local hour could plausibly match this tick, instead of walking them all.
    """
    logger.info("digest scheduler started (tick=%dm, per-user local time)", TICK_MINUTES)
    while True:
        await asyncio.sleep(seconds_until_next_tick(utcnow()))
        try:
            await _run_all_workspaces(provider, llm_provider)
        except Exception:  # noqa: BLE001 — a bad tick must not end the schedule
            # _run_all_workspaces guards each workspace, but opening the session
            # and listing the workspaces sit outside that guard. A single stale
            # connection there used to raise straight through this loop and end
            # the task — permanently, and in total silence: the task object is
            # held by the lifespan, so it's never garbage-collected and asyncio
            # never gets to print "Task exception was never retrieved". Digests
            # then stop for good with nothing in the logs and a healthy /health.
            # Missing one tick is a non-event (delivery is a 6h catch-up window);
            # missing every future tick is the outage. Log it and tick again.
            logger.exception("digest tick failed — scheduler continuing")
