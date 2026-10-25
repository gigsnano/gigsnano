"""Recurrence scheduler (GIN-240): sweep due schedule-trigger automation rules and
fire their actions (create_from_template) on cadence. Mirrors the digest scheduler
loop (fresh session per tick, broad-except-continue so one bad tick never ends the
loop). A recurrence is just an AutomationRule(trigger_event="schedule") with a
`schedule` cadence + `next_run_at`.

ponytail: advances next_run_at one interval from *now*, so a scheduler that was
down does NOT backfill a burst of missed runs (idempotent per tick, no catch-up)."""

import asyncio
import logging
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import async_session, utcnow
from gigsnano_api.features.automations.executor import execute_actions
from gigsnano_api.features.automations.schemas import AutomationAst
from gigsnano_api.models.automations import AutomationRule, AutomationRun
from gigsnano_api.models.projects import Project

logger = logging.getLogger(__name__)

TICK_SECONDS = 60


def advance(now, schedule: dict):
    every = max(1, int((schedule or {}).get("every", 1)))
    unit = (schedule or {}).get("unit", "days")
    if unit not in ("minutes", "hours", "days"):
        unit = "days"
    return now + timedelta(**{unit: every})


async def sweep_due_recurrences(db: AsyncSession, now) -> int:
    """Fire every enabled schedule rule whose next_run_at is due. Returns the count
    fired. Each rule creates from its template, is audited, and advances next_run_at."""
    rules = (
        await db.execute(
            select(AutomationRule).where(
                AutomationRule.trigger_event == "schedule",
                AutomationRule.enabled.is_(True),
                AutomationRule.next_run_at.is_not(None),
                AutomationRule.next_run_at <= now,
            )
        )
    ).scalars().all()
    fired = 0
    for rule in rules:
        project = await db.get(Project, rule.project_id)
        if project is None:
            continue
        from gigsnano_api.auth.models import User

        actor = await db.get(User, project.lead_id) if project.lead_id else None
        if actor is None:
            continue  # no one to attribute the created work to
        try:
            ast = AutomationAst.model_validate(rule.ast)
        except Exception:  # noqa: BLE001 - a corrupt stored rule shouldn't block others
            logging.getLogger(__name__).warning("skipping corrupt automation rule %s", rule.id)
            continue
        taken = await execute_actions(db, ast, project=project, actor=actor, story=None, dry_run=False)
        db.add(AutomationRun(
            automation_id=rule.id, project_id=project.id, trigger_event="schedule",
            dry_run=False, status="matched", actions_taken=taken,
        ))
        rule.next_run_at = advance(now, rule.schedule or {})
        fired += 1
    if fired:
        await db.flush()
    return fired


async def recurrence_scheduler() -> None:
    """Always-on loop: sweep due recurrences every tick. Launched from the app
    lifespan behind settings.recurrence_enabled."""
    while True:
        await asyncio.sleep(TICK_SECONDS)
        try:
            async with async_session() as db:
                n = await sweep_due_recurrences(db, utcnow())
                if n:
                    await db.commit()
                    logger.info("recurrence sweep fired %d rule(s)", n)
        except Exception:  # noqa: BLE001 - a bad tick must never end the loop
            logger.exception("recurrence sweep failed; continuing")
