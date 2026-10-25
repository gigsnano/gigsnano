"""Forecast recalc scheduler (GIN-335 s2 / GIN-339).

A single asyncio task started from the app lifespan (single replica). On each tick
it recomputes every project's forecast and appends a snapshot — append-only and
deduped, so unchanged forecasts never grow the history — and, when a snapshot
records a materially worse health, fires the alert to the project's members.

This is the "scheduled refresh" side of GIN-335; the `POST .../forecasting/recalc/`
endpoint is the same work on demand. Mirrors the digest/recurrence schedulers:
fresh session, per-project guard, and a broad-except-continue so one bad project —
or one stale connection — never ends the loop (a dead lifespan task is silent).

ponytail: recomputes every project each tick (Monte Carlo per project). Fine at
current scale on a coarse interval; if it bites, only sweep projects whose stories
changed since their last snapshot.
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import async_session, utcnow
from gigsnano_api.features.forecasting.alerts import emit_material_change_alerts
from gigsnano_api.features.forecasting.snapshots import record_forecast_snapshot
from gigsnano_api.models import Project, Workspace

logger = logging.getLogger("gigsnano.forecasting")

# Forecasts move slowly (throughput windows), so a coarse interval is plenty and
# keeps the Monte Carlo cost down. Material alerts still land within one interval;
# a user wanting sooner can hit the recalc endpoint.
TICK_SECONDS = 6 * 60 * 60


@asynccontextmanager
async def _session(db: AsyncSession | None):
    """Use an injected session (tests) or open the module session (prod). The
    module-level async_session() ignores the get_db override, so tests must pass
    their own session (see the digest-scheduler tests)."""
    if db is not None:
        yield db
        return
    async with async_session() as owned:
        yield owned


async def _sweep(now: datetime | None = None, *, db: AsyncSession | None = None) -> int:
    """Recalc every project once; return the number of new snapshots created."""
    now = now or utcnow()
    created_count = 0
    async with _session(db) as session:
        projects = (await session.execute(select(Project))).scalars().all()
        for project in projects:
            try:
                snap, created = await record_forecast_snapshot(session, project, now=now)
                if created:
                    created_count += 1
                    ws = await session.get(Workspace, project.workspace_id)
                    if ws is not None:
                        await emit_material_change_alerts(
                            session,
                            project,
                            workspace_id=project.workspace_id,
                            slug=ws.slug,
                            triggered_by_id=None,  # system-triggered
                        )
                await session.commit()
            except Exception:  # noqa: BLE001 — one project must not sink the sweep
                await session.rollback()
                logger.exception("forecast recalc failed for project=%s", project.id)
    return created_count


async def forecast_scheduler() -> None:
    """Tick loop. Cancelled on shutdown (CancelledError propagates out)."""
    logger.info("forecast recalc scheduler started (interval=%ds)", TICK_SECONDS)
    while True:
        await asyncio.sleep(TICK_SECONDS)
        try:
            created = await _sweep()
            if created:
                logger.info("forecast recalc sweep: %d new snapshot(s)", created)
        except Exception:  # noqa: BLE001 — a bad tick must not end the schedule
            logger.exception("forecast recalc sweep failed — scheduler continuing")
