"""Drains `push_outbox` through a `PushSender`, at most once per row.

One tick has two transactions. The claim locks due rows (`SKIP LOCKED`, so a
second instance takes other rows), settles muted / no-device rows, marks the
rest `sending` with `sent_at` set, and COMMITS before any HTTP call. Delivery
then settles each claimed row from its tickets. A row is never sent twice: a
crash between the two leaves it at `sending` for good, and transient failures
are recorded as `failed_transient`, not retried.
"""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.models import User
from gigsnano_api.core.db import async_session, utcnow
from gigsnano_api.features.push.sender import PushMessage, PushSender, PushTicket
from gigsnano_api.models import DeviceToken, PushOutbox

logger = logging.getLogger("gigsnano.push")

BATCH = 500
EXPIRY = timedelta(hours=1)
UNREGISTERED = "DeviceNotRegistered"


async def _expire_stale(db: AsyncSession, now: datetime) -> None:
    await db.execute(
        update(PushOutbox)
        .where(PushOutbox.sent_at.is_(None), PushOutbox.created_at < now - EXPIRY)
        .values(sent_at=now, outcome="expired")
    )


async def _load_context(
    db: AsyncSession, rows: list[PushOutbox]
) -> tuple[dict[str, bool], dict[str, list[DeviceToken]]]:
    user_ids = {r.user_id for r in rows}
    realtime = {
        uid: flag
        for uid, flag in (
            await db.execute(select(User.id, User.push_realtime).where(User.id.in_(user_ids)))
        ).all()
    }
    tokens: dict[str, list[DeviceToken]] = defaultdict(list)
    for tok in (
        await db.execute(select(DeviceToken).where(DeviceToken.user_id.in_(user_ids)))
    ).scalars():
        tokens[tok.user_id].append(tok)
    return realtime, tokens


@dataclass
class Claim:
    """What one tick took: the messages to send and who owns each one."""

    rows: int = 0
    messages: list[PushMessage] = field(default_factory=list)
    owners: list[tuple[str, str]] = field(default_factory=list)  # (outbox id, token id)


def _triage(
    rows: list[PushOutbox],
    realtime: dict[str, bool],
    tokens: dict[str, list[DeviceToken]],
    now: datetime,
) -> Claim:
    """Settle muted / no-device rows; mark the rest `sending` and return them."""
    claim = Claim(rows=len(rows))
    for row in rows:
        row.sent_at = now
        if row.category == "realtime" and not realtime.get(row.user_id, True):
            row.outcome = "muted"
        elif not tokens.get(row.user_id):
            row.outcome = "no_device"
        else:
            row.outcome = "sending"
            for tok in tokens[row.user_id]:
                claim.messages.append(PushMessage(tok.token, row.title, row.body, row.data or {}))
                claim.owners.append((row.id, tok.id))
    return claim


def _outcomes(owners: list[tuple[str, str]], tickets: list[PushTicket]) -> dict[str, str]:
    """One outcome per row: sent if any device took it, else failed_transient when
    every failure was transient, else failed. A missing ticket counts as failed."""
    tickets = tickets + [PushTicket(False, "missing")] * (len(owners) - len(tickets))
    by_row: dict[str, list[PushTicket]] = defaultdict(list)
    for (row_id, _tok), ticket in zip(owners, tickets, strict=False):
        by_row[row_id].append(ticket)
    out: dict[str, str] = {}
    for row_id, row_tickets in by_row.items():
        if any(t.ok for t in row_tickets):
            out[row_id] = "sent"
        elif all(t.transient for t in row_tickets):
            out[row_id] = "failed_transient"
        else:
            out[row_id] = "failed"
    return out


async def claim_due(db: AsyncSession, now: datetime) -> Claim:
    """Lock and claim due rows, then commit — before anything is sent."""
    await _expire_stale(db, now)
    rows = list(
        (
            await db.execute(
                select(PushOutbox)
                .where(PushOutbox.sent_at.is_(None))
                .order_by(PushOutbox.created_at)
                .limit(BATCH)
                .with_for_update(skip_locked=True)
            )
        ).scalars()
    )
    if not rows:
        await db.commit()
        return Claim()
    realtime, tokens = await _load_context(db, rows)
    claim = _triage(rows, realtime, tokens, now)
    await db.commit()
    return claim


async def deliver(db: AsyncSession, sender: PushSender, claim: Claim, now: datetime) -> None:
    """Send a committed claim once and settle each row from its tickets."""
    if not claim.messages:
        return
    try:
        tickets = await sender.send(claim.messages)
    except Exception:  # noqa: BLE001 — rows are claimed; settle them, never resend
        logger.exception("push sender failed — %d message(s) marked failed_transient",
                         len(claim.messages))
        tickets = [PushTicket(False, "sender_error", transient=True)] * len(claim.messages)
    by_outcome: dict[str, list[str]] = defaultdict(list)
    for row_id, outcome in _outcomes(claim.owners, tickets).items():
        by_outcome[outcome].append(row_id)
    for outcome, ids in by_outcome.items():
        await db.execute(
            update(PushOutbox).where(PushOutbox.id.in_(ids)).values(outcome=outcome, sent_at=now)
        )
    dead = [tok for (_, tok), t in zip(claim.owners, tickets, strict=False)
            if t.error == UNREGISTERED]
    if dead:
        await db.execute(delete(DeviceToken).where(DeviceToken.id.in_(dead)))
    await db.commit()


async def run_push_tick(db: AsyncSession, sender: PushSender, *, now: datetime) -> int:
    """Claim due rows, send them once; return the number of rows claimed."""
    claim = await claim_due(db, now)
    await deliver(db, sender, claim, now)
    return claim.rows


async def push_worker(
    sender: PushSender,
    *,
    interval: float = 10.0,
    session_factory: Callable[[], AbstractAsyncContextManager[AsyncSession]] = async_session,
) -> None:
    """Tick loop. Cancelled on shutdown (CancelledError propagates).

    The session factory is injectable: a bare module session ignores the get_db
    override, so tests pass a factory that yields their own session."""
    logger.info("push worker started (interval=%.0fs)", interval)
    while True:
        try:
            async with session_factory() as session:
                done = await run_push_tick(session, sender, now=utcnow())
            if done:
                logger.info("push tick finished %d row(s)", done)
        except Exception:  # noqa: BLE001 — a bad tick must not end the worker
            logger.exception("push tick failed — worker continuing")
        await asyncio.sleep(interval)
