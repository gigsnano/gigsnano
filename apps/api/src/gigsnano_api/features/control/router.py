"""The daily control run and the incremental change feed (GIN-388).

The run reads what the other features already record — readiness (384), blockers
(383), decisions and escalations (386), the forecast — and turns it into findings
plus the actions it would take, each carrying the autonomy policy's verdict (387).

It proposes; it does not apply. Applying is a recovery plan (385), which a human
approves. A run that changed nothing must not read as a run that decided nothing
was wrong, so every finding names the evidence behind it.
"""

import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import get_db
from gigsnano_api.features.autonomy.policy import ActionRequest, evaluate
from gigsnano_api.features.autonomy.router import _policy_row, _view
from gigsnano_api.features.forecasting.service import compute_health
from gigsnano_api.features.stories.readiness import EReadiness
from gigsnano_api.features.stories.readiness_router import _assess_project
from gigsnano_api.models import (
    EBlockerStatus,
    EControlRunStatus,
    EDecisionStatus,
    EEscalationStatus,
    EStoryStatus,
    Project,
    ProjectActivity,
    ProjectControlRun,
    ProjectDecision,
    ProjectEscalation,
    Story,
    WorkItemBlocker,
)
from gigsnano_api.shared.context import (
    WorkspaceContext,
    get_project_or_404,
    get_workspace_context,
    require_project_write_access,
)

router = APIRouter(tags=["control"])

_P = "/workspaces/{workspace_slug}/projects/{project_id}"
#: Work that has not moved in this long is worth a human's attention even when
#: every field on it is filled in correctly.
STALE_AFTER = timedelta(days=14)
MAX_FEED_ITEMS = 200


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _finding(kind: str, severity: str, summary: str, evidence: list[str]) -> dict:
    """Every finding carries what it is based on. A control run that asserts a
    conclusion without naming the rows behind it cannot be checked."""
    return {"kind": kind, "severity": severity, "summary": summary, "evidence": evidence}


async def _stale_items(db: AsyncSession, project: Project, now: datetime) -> list[Story]:
    rows = (
        await db.execute(
            select(Story).where(
                Story.project_id == project.id,
                Story.status.in_([EStoryStatus.IN_PROGRESS, EStoryStatus.IN_REVIEW]),
            )
        )
    ).scalars().all()
    return [s for s in rows if now - _aware(s.updated_at) > STALE_AFTER]


async def _readiness_findings(
    db: AsyncSession, project: Project
) -> tuple[list[dict], list[dict]]:
    """What the backlog itself says: unready work, blocked work, unowned commitments."""
    assessments, total = await _assess_project(db, project)
    findings, proposals = [], []

    unready = [
        a for a in assessments
        if a.readiness in (EReadiness.DRAFT, EReadiness.NEEDS_CLARIFICATION)
    ]
    if unready:
        findings.append(_finding(
            "backlog_readiness", "warning",
            f"{len(unready)} of {total} work items are not ready to start.",
            [a.code for a in unready[:10]],
        ))
    blocked = [a for a in assessments if a.readiness is EReadiness.BLOCKED]
    if blocked:
        findings.append(_finding(
            "blocked_work", "warning",
            f"{len(blocked)} work items are blocked.",
            [a.code for a in blocked[:10]],
        ))
    unowned = [a for a in assessments if any(f.rule == "owner" for f in a.findings)]
    if unowned:
        findings.append(_finding(
            "committed_without_owner", "error",
            f"{len(unowned)} committed items have no owner.",
            [a.code for a in unowned[:10]],
        ))
        proposals.append({
            "action": "assign_owner",
            "summary": f"Assign an owner to {len(unowned)} committed items",
            "codes": [a.code for a in unowned],
            "item_count": len(unowned),
        })
    return findings, proposals


async def _governance_findings(db: AsyncSession, project: Project) -> list[dict]:
    """Records that have gone past the date someone promised to act on them."""
    findings = []
    today = date.today()

    blockers = (await db.execute(select(WorkItemBlocker).where(
        WorkItemBlocker.project_id == project.id,
        WorkItemBlocker.status == EBlockerStatus.OPEN,
    ))).scalars().all()
    overdue = [b for b in blockers if b.expected_resolution_date and b.expected_resolution_date < today]
    if overdue:
        findings.append(_finding(
            "blockers_overdue", "error",
            f"{len(overdue)} blockers are past their expected resolution date.",
            [b.reason[:60] for b in overdue[:10]],
        ))

    decisions = (await db.execute(select(ProjectDecision).where(
        ProjectDecision.project_id == project.id,
        ProjectDecision.status == EDecisionStatus.OPEN,
    ))).scalars().all()
    late = [d for d in decisions if d.due_date and d.due_date < today]
    if late:
        findings.append(_finding(
            "decisions_overdue", "error",
            f"{len(late)} decisions are past due.",
            [d.question[:80] for d in late[:10]],
        ))

    escalations = (await db.execute(select(ProjectEscalation).where(
        ProjectEscalation.project_id == project.id,
        ProjectEscalation.status != EEscalationStatus.RESOLVED,
    ))).scalars().all()
    if escalations:
        findings.append(_finding(
            "escalations_open", "warning",
            f"{len(escalations)} escalations are still open.",
            [e.title[:80] for e in escalations[:10]],
        ))
    return findings


async def _staleness_findings(
    db: AsyncSession, project: Project, now: datetime
) -> tuple[list[dict], list[dict]]:
    """Work that claims to be moving but is not."""
    stale = await _stale_items(db, project, now)
    if not stale:
        return [], []
    codes = [f"{project.identifier}-{s.story_number}" for s in stale]
    finding = _finding(
        "stale_in_flight", "warning",
        f"{len(stale)} items have been in flight without an update for over "
        f"{STALE_AFTER.days} days.",
        codes[:10],
    )
    # Ask, do not reassign: moving it back makes the stall visible to its owner.
    proposal = {
        "action": "change_status",
        "summary": f"Move {len(stale)} stalled items back to todo pending an update",
        "codes": codes,
        "item_count": len(stale),
        "status_transition": ["in_progress", "todo"],
    }
    return [finding], [proposal]


async def _gather(
    db: AsyncSession, project: Project, now: datetime
) -> tuple[list[dict], list[dict]]:
    """(findings, proposed actions). Deterministic: it reads records, it does not
    infer intent."""
    findings, proposals = await _readiness_findings(db, project)
    findings += await _governance_findings(db, project)
    stale_findings, stale_proposals = await _staleness_findings(db, project, now)
    return findings + stale_findings, proposals + stale_proposals


@router.post(_P + "/control-runs/", status_code=status.HTTP_201_CREATED)
async def run_control_cycle(
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Run one control cycle: observe, compare, propose. Nothing is applied — each
    proposal carries the autonomy policy's verdict so a caller knows which ones
    could have run unattended and which need a human."""
    now = datetime.now(timezone.utc)
    previous = (
        await db.execute(
            select(ProjectControlRun)
            .where(ProjectControlRun.project_id == project.id)
            .order_by(ProjectControlRun.window_to.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    findings, proposals = await _gather(db, project, now)
    health = await compute_health(db, project, now=now)
    policy = _view(await _policy_row(db, project))

    awaiting, allowed = [], []
    for proposal in proposals:
        decision = evaluate(
            policy,
            ActionRequest(
                action=proposal["action"],
                item_count=proposal.get("item_count", 1),
                status_transition=(
                    tuple(proposal["status_transition"])
                    if proposal.get("status_transition") else None
                ),
            ),
            now=now,
        )
        entry = {**proposal, "policy": decision.as_dict()}
        (allowed if decision.allowed else awaiting).append(entry)

    run = ProjectControlRun(
        project_id=project.id,
        window_from=previous.window_to if previous else None,
        window_to=now,
        findings={"items": findings, "counts": {f["kind"]: 1 for f in findings}},
        actions_proposed=proposals,
        # Nothing executes here: proposals become a recovery plan (GIN-385) that a
        # human approves. Saying "executed: none" is the honest record.
        actions_executed=[],
        actions_awaiting_approval=awaiting,
        actions_failed=[],
        forecast_before=previous.forecast_after if previous else None,
        forecast_after=health.model_dump(mode="json") if hasattr(health, "model_dump") else None,
        correlation_id=str(uuid.uuid4()),
        triggered_by_id=ctx.user.id,
        status=EControlRunStatus.COMPLETED,
    )
    db.add(run)
    await db.commit()
    return _run_out(run, within_policy=allowed)


def _run_out(run: ProjectControlRun, *, within_policy: list | None = None) -> dict:
    return {
        "id": run.id,
        "project_id": run.project_id,
        "status": run.status.value,
        "window_from": run.window_from,
        "window_to": run.window_to,
        "findings": run.findings,
        "actions_proposed": run.actions_proposed,
        "actions_executed": run.actions_executed,
        "actions_awaiting_approval": run.actions_awaiting_approval,
        "actions_failed": run.actions_failed,
        "actions_within_policy": within_policy if within_policy is not None else [],
        "forecast_before": run.forecast_before,
        "forecast_after": run.forecast_after,
        "model": run.model,
        "correlation_id": run.correlation_id,
        "created_at": run.created_at,
    }


@router.get(_P + "/control-runs/")
async def list_control_runs(
    limit: int = 20,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
) -> dict:
    rows = (
        await db.execute(
            select(ProjectControlRun)
            .where(ProjectControlRun.project_id == project.id)
            .order_by(ProjectControlRun.window_to.desc())
            .limit(max(1, min(limit, 100)))
        )
    ).scalars().all()
    return {"total": len(rows), "items": [_run_out(r) for r in rows]}


@router.get(_P + "/control-runs/{run_id}/")
async def get_control_run(
    run_id: str,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
) -> dict:
    run = await db.get(ProjectControlRun, run_id)
    if run is None or run.project_id != project.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Control run not found")
    return _run_out(run)


@router.get(_P + "/changes/")
async def project_changes(
    since: datetime | None = None,
    limit: int = 100,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Project activity since a timestamp, with a cursor to resume from. The point
    of a daily run is not re-reading the whole project every morning."""
    query = select(ProjectActivity).where(ProjectActivity.project_id == project.id)
    if since is not None:
        query = query.where(ProjectActivity.created_at > since)
    rows = list(
        (
            await db.execute(
                query.order_by(ProjectActivity.created_at).limit(max(1, min(limit, MAX_FEED_ITEMS)))
            )
        ).scalars().all()
    )
    return {
        "since": since,
        "returned": len(rows),
        # Resume from here next time; null when nothing came back, so a caller
        # never advances its cursor past events it has not seen.
        "cursor": rows[-1].created_at if rows else since,
        "items": [
            {
                "id": r.id, "type": r.type.value, "action": r.action,
                "actor_name": r.actor_name, "created_at": r.created_at,
            }
            for r in rows
        ],
    }


@router.get(_P + "/stale-work-items/")
async def stale_work_items(
    days: int = 14,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """In-flight work that has not moved. Stale *in flight* is the signal — a
    backlog item nobody touched is just a backlog item."""
    now = datetime.now(timezone.utc)
    cutoff = timedelta(days=max(1, days))
    rows = (
        await db.execute(
            select(Story).where(
                Story.project_id == project.id,
                Story.status.in_([EStoryStatus.IN_PROGRESS, EStoryStatus.IN_REVIEW]),
            )
        )
    ).scalars().all()
    items = [
        {
            "code": f"{project.identifier}-{s.story_number}",
            "title": s.title,
            "status": s.status.value,
            "assignee_id": s.assignee_id,
            "days_since_update": (now - _aware(s.updated_at)).days,
        }
        for s in rows
        if now - _aware(s.updated_at) > cutoff
    ]
    items.sort(key=lambda i: i["days_since_update"], reverse=True)
    return {"threshold_days": max(1, days), "total": len(items), "items": items}


@router.get(_P + "/today-plan/")
async def team_today_plan(
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """What each person has in flight, and what is blocking them — grouped by
    owner rather than by status, because that is how a standup reads."""
    now = datetime.now(timezone.utc)
    stories = (
        await db.execute(
            select(Story).where(
                Story.project_id == project.id, Story.status != EStoryStatus.DONE
            )
        )
    ).scalars().all()
    blocked_ids = {
        b.story_id
        for b in (
            await db.execute(
                select(WorkItemBlocker).where(
                    WorkItemBlocker.project_id == project.id,
                    WorkItemBlocker.status == EBlockerStatus.OPEN,
                )
            )
        ).scalars().all()
    }
    by_owner: dict[str, list[dict]] = {}
    for s in stories:
        if s.status not in (EStoryStatus.IN_PROGRESS, EStoryStatus.IN_REVIEW):
            continue
        by_owner.setdefault(s.assignee_id or "unassigned", []).append({
            "code": f"{project.identifier}-{s.story_number}",
            "title": s.title,
            "status": s.status.value,
            "blocked": s.id in blocked_ids,
            "target_date": s.target_date,
            "days_since_update": (now - _aware(s.updated_at)).days,
        })
    return {
        "generated_at": now,
        "owners": [
            {
                "assignee_id": None if owner == "unassigned" else owner,
                "in_flight": len(items),
                "blocked": sum(1 for i in items if i["blocked"]),
                "items": sorted(items, key=lambda i: i["days_since_update"], reverse=True),
            }
            for owner, items in sorted(by_owner.items())
        ],
    }
