"""Recovery plans (GIN-385): propose a change set, approve part of it, apply only
what was approved, undo what was applied.

The plan never applies itself. Creating one writes nothing to the project; only
`apply` mutates, only approved changes are applied, and every applied change
stores the value it replaced so rollback restores rather than guesses.

Applying is also where the autonomy policy (GIN-387) actually bites: a paused
director cannot apply a plan, however well-approved it is.
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import get_db
from gigsnano_api.features.autonomy.router import _policy_row, _view
from gigsnano_api.features.inbox.recipients import notify_decision_makers
from gigsnano_api.features.mutations import structured_http
from gigsnano_api.features.projects.router import record_activity
from gigsnano_api.features.stories.codes import resolve_codes
from gigsnano_api.features.stories.readiness import propose_repair
from gigsnano_api.features.stories.service import _apply_story_update
from gigsnano_api.models import (
    EChangeStatus,
    EPlanStatus,
    EProjectActivityType,
    Project,
    RecoveryPlan,
    RecoveryPlanChange,
    Story,
)
from gigsnano_api.shared.context import (
    WorkspaceContext,
    get_project_or_404,
    get_workspace_context,
    require_project_write_access,
)

router = APIRouter(tags=["recovery"])

_P = "/workspaces/{workspace_slug}/projects/{project_id}"

#: The fields a plan may change — the same narrow set the bulk endpoint writes,
#: so a plan cannot reach anywhere a reviewed write cannot.
APPLIABLE_FIELDS = frozenset(
    {"status", "priority", "type", "assignee_id", "label_id", "label_ids", "cycle_id",
     "module_id", "start_date", "target_date"}
)


class ChangeIn(BaseModel):
    code: str
    field: str
    proposed_value: str | None = None
    reason: str = ""
    evidence: str = ""
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)


class PlanIn(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    summary: str = ""
    changes: list[ChangeIn] = Field(default_factory=list)
    #: Seed the plan from the readiness audit's machine-applicable repairs.
    from_readiness_audit: bool = False


class DecisionIn(BaseModel):
    """Approve or reject specific changes. Omit `change_ids` to decide all of them."""

    change_ids: list[str] | None = None
    note: str = ""


def _change_out(row: RecoveryPlanChange) -> dict:
    return {
        "id": row.id,
        "code": row.code,
        "field": row.field,
        "current_value": row.current_value,
        "proposed_value": row.proposed_value,
        "previous_value": row.previous_value,
        "reason": row.reason,
        "evidence": row.evidence,
        "confidence": row.confidence,
        "status": row.status.value,
        "error": row.error,
        "applied_at": row.applied_at,
    }


def _plan_out(plan: RecoveryPlan, changes: list[RecoveryPlanChange]) -> dict:
    tally: dict[str, int] = {}
    for c in changes:
        tally[c.status.value] = tally.get(c.status.value, 0) + 1
    return {
        "id": plan.id,
        "project_id": plan.project_id,
        "title": plan.title,
        "summary": plan.summary,
        "status": plan.status.value,
        "correlation_id": plan.correlation_id,
        "created_by_name": plan.created_by_name,
        "created_at": plan.created_at,
        "applied_at": plan.applied_at,
        "counts": {"total": len(changes), **tally},
        "changes": [_change_out(c) for c in changes],
    }


async def _plan_or_404(db: AsyncSession, project: Project, plan_id: str) -> RecoveryPlan:
    plan = await db.get(RecoveryPlan, plan_id)
    if plan is None or plan.project_id != project.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Recovery plan not found")
    return plan


async def _changes(db: AsyncSession, plan: RecoveryPlan) -> list[RecoveryPlanChange]:
    return list(
        (
            await db.execute(
                select(RecoveryPlanChange)
                .where(RecoveryPlanChange.plan_id == plan.id)
                .order_by(RecoveryPlanChange.created_at)
            )
        ).scalars().all()
    )


def _render(value: object) -> str | None:
    if value is None:
        return None
    return str(getattr(value, "value", value))


async def _audit_seeded_changes(
    db: AsyncSession, project: Project
) -> list[tuple[str, str, str | None, str, float]]:
    """(code, field, proposed, reason, confidence) for the repairs a machine may
    safely make. Judgement calls — a missing acceptance criterion — are left out
    on purpose: a recovery plan must not invent requirements."""
    from gigsnano_api.features.stories.readiness_router import _assess_project

    assessments, _total = await _assess_project(db, project)
    seeded = []
    for assessment in assessments:
        for proposal in propose_repair(assessment):
            change = proposal.get("change")
            if not proposal["auto_applicable"] or not change:
                continue
            seeded.append((
                assessment.code, change["field"], change.get("suggested"),
                proposal["reason"], proposal["confidence"],
            ))
    return seeded


@router.post(_P + "/recovery-plans/", status_code=status.HTTP_201_CREATED)
async def create_plan(
    payload: PlanIn,
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Propose a plan. This writes the plan, and nothing else — the project is not
    touched until someone approves changes and applies them."""
    proposed = [
        (c.code, c.field, c.proposed_value, c.reason, c.evidence, c.confidence)
        for c in payload.changes
    ]
    if payload.from_readiness_audit:
        proposed += [
            (code, field, value, reason, "readiness audit", confidence)
            for code, field, value, reason, confidence in await _audit_seeded_changes(db, project)
        ]
    if not proposed:
        raise structured_http(
            status.HTTP_400_BAD_REQUEST, "empty_plan",
            "A plan needs at least one change; pass `changes` or from_readiness_audit=true.",
            retryable=False,
        )

    bad = sorted({field for _c, field, *_ in proposed} - APPLIABLE_FIELDS)
    if bad:
        raise structured_http(
            status.HTTP_400_BAD_REQUEST, "unsupported_field",
            f"A recovery plan can only change {', '.join(sorted(APPLIABLE_FIELDS))}; "
            f"got {', '.join(bad)}.",
            retryable=False,
        )

    found, codes, failed = await resolve_codes(db, project, [c for c, *_ in proposed])
    by_code = {codes[num]: story for num, story in found.items()}
    if failed:
        raise structured_http(
            status.HTTP_400_BAD_REQUEST, "unresolvable_codes",
            "Some work items could not be resolved: "
            + ", ".join(f"{f['code']} ({f['error']})" for f in failed),
            retryable=False,
        )

    plan = RecoveryPlan(
        project_id=project.id,
        title=payload.title,
        summary=payload.summary,
        created_by_id=ctx.user.id,
        created_by_name=ctx.user.display_name,
        correlation_id=str(uuid.uuid4()),
    )
    db.add(plan)
    await db.flush()
    for code, field, value, reason, evidence, confidence in proposed:
        story = by_code[code]
        db.add(RecoveryPlanChange(
            plan_id=plan.id,
            code=code,
            field=field,
            current_value=_render(getattr(story, field, None)),
            proposed_value=_render(value),
            reason=reason,
            evidence=evidence,
            confidence=confidence,
        ))
    await notify_decision_makers(
        db,
        ctx.workspace.id,
        project.id,
        actor_id=ctx.user.id,
        title=f"Recovery plan to review: {plan.title}",
        body=(plan.summary or "")[:300],
    )
    await db.commit()
    return _plan_out(plan, await _changes(db, plan))


@router.get(_P + "/recovery-plans/")
async def list_plans(
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
) -> dict:
    plans = list(
        (
            await db.execute(
                select(RecoveryPlan)
                .where(RecoveryPlan.project_id == project.id)
                .order_by(RecoveryPlan.created_at.desc())
            )
        ).scalars().all()
    )
    return {
        "total": len(plans),
        "items": [_plan_out(p, await _changes(db, p)) for p in plans],
    }


@router.get(_P + "/recovery-plans/{plan_id}/")
async def get_plan(
    plan_id: str,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
) -> dict:
    plan = await _plan_or_404(db, project, plan_id)
    return _plan_out(plan, await _changes(db, plan))


def _selected(changes: list[RecoveryPlanChange], ids: list[str] | None) -> list[RecoveryPlanChange]:
    if ids is None:
        return changes
    wanted = set(ids)
    return [c for c in changes if c.id in wanted]


@router.post(_P + "/recovery-plans/{plan_id}/approve/")
async def approve_changes(
    plan_id: str,
    payload: DecisionIn,
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Approve some or all of a plan. Partial approval is the normal case — the
    point of a change set is that you can take the good half."""
    plan = await _plan_or_404(db, project, plan_id)
    changes = await _changes(db, plan)
    for change in _selected(changes, payload.change_ids):
        if change.status is EChangeStatus.PROPOSED:
            change.status = EChangeStatus.APPROVED
            change.decided_by_id = ctx.user.id
    if any(c.status is EChangeStatus.APPROVED for c in changes):
        plan.status = EPlanStatus.APPROVED
    await db.commit()
    return _plan_out(plan, await _changes(db, plan))


@router.post(_P + "/recovery-plans/{plan_id}/reject/")
async def reject_changes(
    plan_id: str,
    payload: DecisionIn,
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict:
    plan = await _plan_or_404(db, project, plan_id)
    changes = await _changes(db, plan)
    for change in _selected(changes, payload.change_ids):
        if change.status is EChangeStatus.PROPOSED:
            change.status = EChangeStatus.REJECTED
            change.decided_by_id = ctx.user.id
    remaining = await _changes(db, plan)
    if all(c.status is EChangeStatus.REJECTED for c in remaining):
        plan.status = EPlanStatus.REJECTED
    await db.commit()
    return _plan_out(plan, await _changes(db, plan))


@router.post(_P + "/recovery-plans/{plan_id}/apply/")
async def apply_plan(
    plan_id: str,
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Apply only the approved changes. Each one stores the value it replaced, so
    rollback restores rather than guesses; a change that fails is recorded as
    failed and does not stop the rest."""
    plan = await _plan_or_404(db, project, plan_id)
    policy = _view(await _policy_row(db, project))
    if policy.paused:
        raise structured_http(
            status.HTTP_409_CONFLICT, "director_paused",
            "The project director is paused; recovery plans cannot be applied."
            + (f" Reason: {policy.paused_reason}" if policy.paused_reason else ""),
            retryable=True,
        )

    changes = await _changes(db, plan)
    approved = [c for c in changes if c.status is EChangeStatus.APPROVED]
    if not approved:
        raise structured_http(
            status.HTTP_409_CONFLICT, "nothing_approved",
            "No approved changes to apply — approve some first.", retryable=False,
        )

    found, codes, _failed = await resolve_codes(db, project, [c.code for c in approved])
    by_code = {codes[num]: story for num, story in found.items()}
    applied = 0
    for change in approved:
        story = by_code.get(change.code)
        if story is None:
            change.status = EChangeStatus.FAILED
            change.error = "work item no longer resolvable"
            continue
        try:
            change.previous_value = _render(getattr(story, change.field, None))
            await _apply_story_update(db, story, ctx.user, {change.field: change.proposed_value})
            change.status = EChangeStatus.APPLIED
            change.applied_at = datetime.now(timezone.utc)
            applied += 1
        except Exception as err:  # noqa: BLE001 — one bad change must not sink the plan
            change.status = EChangeStatus.FAILED
            change.error = str(err)[:500]

    plan.status = EPlanStatus.APPLIED
    plan.applied_at = datetime.now(timezone.utc)
    plan.applied_by_id = ctx.user.id
    record_activity(
        db, project.id, EProjectActivityType.STORY, ctx.user,
        f"applied recovery plan '{plan.title}' ({applied} changes, {plan.correlation_id})",
    )
    await db.commit()
    return _plan_out(plan, await _changes(db, plan))


@router.post(_P + "/recovery-plans/{plan_id}/rollback/")
async def rollback_plan(
    plan_id: str,
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Restore every applied change to the value it replaced. Changes that were
    never applied are left alone — rollback undoes what happened, not what was
    merely proposed."""
    plan = await _plan_or_404(db, project, plan_id)
    if plan.status is not EPlanStatus.APPLIED:
        raise structured_http(
            status.HTTP_409_CONFLICT, "plan_not_applied",
            f"This plan is {plan.status.value}; only an applied plan can be rolled back.",
            retryable=False,
        )
    changes = await _changes(db, plan)
    restorable = [c for c in changes if c.status is EChangeStatus.APPLIED]
    found, codes, _failed = await resolve_codes(db, project, [c.code for c in restorable])
    by_code = {codes[num]: story for num, story in found.items()}
    for change in restorable:
        story: Story | None = by_code.get(change.code)
        if story is None:
            change.error = "work item no longer resolvable; not restored"
            continue
        await _apply_story_update(db, story, ctx.user, {change.field: change.previous_value})
        change.status = EChangeStatus.ROLLED_BACK
    plan.status = EPlanStatus.ROLLED_BACK
    record_activity(
        db, project.id, EProjectActivityType.STORY, ctx.user,
        f"rolled back recovery plan '{plan.title}' ({plan.correlation_id})",
    )
    await db.commit()
    return _plan_out(plan, await _changes(db, plan))
