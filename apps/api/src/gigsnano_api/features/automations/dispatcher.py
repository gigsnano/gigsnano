"""Trigger runtime (GIN-253): on a domain event / status transition, match enabled
rules by trigger + conditions and hand them to the sandboxed executor, recording
one AutomationRun per firing. A transition is just a `story.updated` event with a
status delta, so event and transition share this one dispatcher (no second seam).

ponytail: schedule-trigger rules are stored but not yet swept by a periodic task —
the digest scheduler pattern is the upgrade path (needs a per-rule schedule spec).
Dispatch runs inline in the request (behind a try/except so it never breaks the
write); move to a background fresh-session task like webhooks at scale."""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.features.automations.executor import execute_actions
from gigsnano_api.features.automations.schemas import AutomationAst, Condition
from gigsnano_api.models.automations import AutomationRule, AutomationRun

logger = logging.getLogger(__name__)


def _cmp(op: str, actual, value) -> bool:
    actual_s = "" if actual is None else str(actual)
    if op == "eq":
        return actual_s == str(value)
    if op == "neq":
        return actual_s != str(value)
    if op == "contains":
        return str(value).lower() in actual_s.lower()
    if op == "in":
        vals = value if isinstance(value, list) else [value]
        return actual_s in {str(v) for v in vals}
    return False


def conditions_match(conditions: list[Condition], data: dict) -> bool:
    """AND over all conditions against the (flat) event payload."""
    return all(_cmp(c.op, data.get(c.field), c.value) for c in conditions)


async def run_automations(
    db: AsyncSession, *, project, actor, event: str, data: dict, story=None, dry_run: bool = False
) -> list[AutomationRun]:
    rules = (
        await db.execute(
            select(AutomationRule).where(
                AutomationRule.project_id == project.id,
                AutomationRule.trigger_event == event,
                AutomationRule.enabled.is_(True),
            )
        )
    ).scalars().all()
    runs: list[AutomationRun] = []
    for rule in rules:
        try:
            ast = AutomationAst.model_validate(rule.ast)
        except Exception:  # noqa: BLE001 - a corrupt stored rule shouldn't block others
            logging.getLogger(__name__).warning("skipping corrupt automation rule %s", rule.id)
            continue
        if not conditions_match(ast.conditions, data):
            continue
        taken = await execute_actions(
            db, ast, project=project, actor=actor, story=story, dry_run=dry_run
        )
        run = AutomationRun(
            automation_id=rule.id, project_id=project.id, trigger_event=event,
            story_id=story.id if story is not None else None,
            dry_run=dry_run, status="matched", actions_taken=taken,
        )
        db.add(run)
        await db.flush()
        runs.append(run)
    return runs


async def run_automations_safe(db: AsyncSession, *, project, actor, event: str, data: dict, story=None) -> None:
    """Route-side tap: fire matching automations after the triggering write, then
    commit their side effects. Never raises — an automation bug can't break the
    story create/update it reacted to (same contract as webhook dispatch)."""
    try:
        runs = await run_automations(db, project=project, actor=actor, event=event, data=data, story=story)
        if runs:
            await db.commit()
    except Exception:  # noqa: BLE001
        logger.exception("automation dispatch failed for %s on project %s", event, project.id)
        await db.rollback()
