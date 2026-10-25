"""Risks, decisions and escalations (GIN-386).

Three small CRUD surfaces that share one shape: a record with an owner, a due
date and a closing action that demands a reason. Raising and updating them is
delivery work (DELIVER); nothing here is project configuration.
"""

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import get_db
from gigsnano_api.features.inbox.recipients import notify_decision_makers
from gigsnano_api.features.mutations import structured_http
from gigsnano_api.models import (
    EDecisionStatus,
    EEscalationCategory,
    EEscalationStatus,
    ERiskCategory,
    ERiskStatus,
    Project,
    ProjectDecision,
    ProjectEscalation,
    ProjectRisk,
)
from gigsnano_api.shared.context import (
    WorkspaceContext,
    get_project_or_404,
    get_workspace_context,
    require_project_write_access,
)

router = APIRouter(tags=["governance"])

_P = "/workspaces/{workspace_slug}/projects/{project_id}"


# ─────────────────────────────── Risks ───────────────────────────────


class RiskIn(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    description: str = ""
    category: ERiskCategory = ERiskCategory.DELIVERY
    probability: int = Field(default=3, ge=1, le=5)
    impact: int = Field(default=3, ge=1, le=5)
    owner_id: str | None = None
    mitigation: str = ""
    contingency: str = ""
    trigger: str = ""
    due_date: date | None = None
    affected_work_item_codes: list[str] | None = None
    affected_milestone_ids: list[str] | None = None


class RiskPatch(BaseModel):
    title: str | None = None
    description: str | None = None
    category: ERiskCategory | None = None
    status: ERiskStatus | None = None
    probability: int | None = Field(default=None, ge=1, le=5)
    impact: int | None = Field(default=None, ge=1, le=5)
    owner_id: str | None = None
    mitigation: str | None = None
    contingency: str | None = None
    trigger: str | None = None
    due_date: date | None = None
    affected_work_item_codes: list[str] | None = None
    affected_milestone_ids: list[str] | None = None


class CloseRiskPayload(BaseModel):
    note: str = ""
    occurred: bool = False  # it stopped being a risk and became a fact


def _risk_out(row: ProjectRisk) -> dict:
    return {
        "id": row.id,
        "project_id": row.project_id,
        "title": row.title,
        "description": row.description,
        "category": row.category.value,
        "status": row.status.value,
        "probability": row.probability,
        "impact": row.impact,
        "exposure": row.exposure,
        "owner_id": row.owner_id,
        "mitigation": row.mitigation,
        "contingency": row.contingency,
        "trigger": row.trigger,
        "due_date": row.due_date,
        "affected_work_item_codes": row.affected_work_item_codes,
        "affected_milestone_ids": row.affected_milestone_ids,
        "closed_at": row.closed_at,
        "closure_note": row.closure_note,
        "overdue": (
            row.status in (ERiskStatus.OPEN, ERiskStatus.MITIGATING)
            and row.due_date is not None
            and row.due_date < date.today()
        ),
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


async def _risk_or_404(db: AsyncSession, project: Project, risk_id: str) -> ProjectRisk:
    row = await db.get(ProjectRisk, risk_id)
    if row is None or row.project_id != project.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Risk not found")
    return row


@router.post(_P + "/risks/", status_code=status.HTTP_201_CREATED)
async def create_risk(
    payload: RiskIn,
    project: Project = Depends(require_project_write_access),
    db: AsyncSession = Depends(get_db),
) -> dict:
    row = ProjectRisk(
        project_id=project.id,
        exposure=payload.probability * payload.impact,
        **payload.model_dump(),
    )
    db.add(row)
    await db.commit()
    return _risk_out(row)


@router.get(_P + "/risks/")
async def list_risks(
    status_filter: str | None = None,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Highest exposure first — a risk register sorted by anything else is a list
    nobody reads to the bottom of."""
    query = select(ProjectRisk).where(ProjectRisk.project_id == project.id)
    if status_filter:
        query = query.where(
            ProjectRisk.status.in_([s.strip() for s in status_filter.split(",") if s.strip()])
        )
    rows = list((await db.execute(query.order_by(ProjectRisk.exposure.desc()))).scalars().all())
    items = [_risk_out(r) for r in rows]
    return {
        "total": len(items),
        "open": sum(1 for i in items if i["status"] in ("open", "mitigating")),
        "overdue": sum(1 for i in items if i["overdue"]),
        "highest_exposure": items[0]["exposure"] if items else 0,
        "items": items,
    }


@router.get(_P + "/risks/{risk_id}/")
async def get_risk(
    risk_id: str,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return _risk_out(await _risk_or_404(db, project, risk_id))


@router.patch(_P + "/risks/{risk_id}/")
async def update_risk(
    risk_id: str,
    payload: RiskPatch,
    project: Project = Depends(require_project_write_access),
    db: AsyncSession = Depends(get_db),
) -> dict:
    row = await _risk_or_404(db, project, risk_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    # Exposure is stored, so it has to be recomputed when either factor moves.
    row.exposure = row.probability * row.impact
    await db.commit()
    return _risk_out(row)


@router.post(_P + "/risks/{risk_id}/close/")
async def close_risk(
    risk_id: str,
    payload: CloseRiskPayload,
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Close a risk. `occurred=true` records that it happened — a register where
    materialized risks are indistinguishable from avoided ones teaches nothing."""
    row = await _risk_or_404(db, project, risk_id)
    if row.status in (ERiskStatus.CLOSED, ERiskStatus.OCCURRED):
        raise structured_http(
            status.HTTP_409_CONFLICT, "risk_already_closed",
            f"This risk is already {row.status.value}.", retryable=False,
        )
    row.status = ERiskStatus.OCCURRED if payload.occurred else ERiskStatus.CLOSED
    row.closed_at = datetime.now(timezone.utc)
    row.closed_by_id = ctx.user.id
    row.closure_note = payload.note
    await db.commit()
    return _risk_out(row)


# ───────────────────────────── Decisions ─────────────────────────────


class DecisionIn(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    context: str = ""
    options: list[dict] | None = None
    recommended_option: str | None = None
    rationale: str = ""
    evidence: str = ""
    impact_of_delay: str = ""
    owner_id: str | None = None
    due_date: date | None = None


class DecisionPatch(BaseModel):
    question: str | None = None
    context: str | None = None
    options: list[dict] | None = None
    recommended_option: str | None = None
    rationale: str | None = None
    evidence: str | None = None
    impact_of_delay: str | None = None
    owner_id: str | None = None
    due_date: date | None = None
    status: EDecisionStatus | None = None


class ResolveDecisionPayload(BaseModel):
    selected_option: str = Field(min_length=1, max_length=120)
    note: str = ""


def _decision_out(row: ProjectDecision) -> dict:
    return {
        "id": row.id,
        "project_id": row.project_id,
        "question": row.question,
        "context": row.context,
        "options": row.options,
        "recommended_option": row.recommended_option,
        "rationale": row.rationale,
        "evidence": row.evidence,
        "impact_of_delay": row.impact_of_delay,
        "status": row.status.value,
        "owner_id": row.owner_id,
        "due_date": row.due_date,
        "selected_option": row.selected_option,
        "decided_by_id": row.decided_by_id,
        "decided_by_name": row.decided_by_name,
        "decided_at": row.decided_at,
        "decision_note": row.decision_note,
        "overdue": (
            row.status is EDecisionStatus.OPEN
            and row.due_date is not None
            and row.due_date < date.today()
        ),
        "created_at": row.created_at,
    }


async def _decision_or_404(
    db: AsyncSession, project: Project, decision_id: str
) -> ProjectDecision:
    row = await db.get(ProjectDecision, decision_id)
    if row is None or row.project_id != project.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Decision not found")
    return row


@router.post(_P + "/decisions/", status_code=status.HTTP_201_CREATED)
async def create_decision(
    payload: DecisionIn,
    project: Project = Depends(require_project_write_access),
    db: AsyncSession = Depends(get_db),
) -> dict:
    row = ProjectDecision(project_id=project.id, **payload.model_dump())
    db.add(row)
    await db.commit()
    return _decision_out(row)


@router.get(_P + "/decisions/")
async def list_decisions(
    status_filter: str | None = None,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Open decisions by due date — the ones already late come first."""
    query = select(ProjectDecision).where(ProjectDecision.project_id == project.id)
    if status_filter:
        query = query.where(
            ProjectDecision.status.in_(
                [s.strip() for s in status_filter.split(",") if s.strip()]
            )
        )
    else:
        query = query.where(ProjectDecision.status == EDecisionStatus.OPEN)
    rows = list((await db.execute(query)).scalars().all())
    items = sorted(
        (_decision_out(r) for r in rows),
        key=lambda d: (d["due_date"] is None, d["due_date"] or date.max),
    )
    return {
        "total": len(items),
        "overdue": sum(1 for i in items if i["overdue"]),
        "items": items,
    }


@router.get(_P + "/decisions/{decision_id}/")
async def get_decision(
    decision_id: str,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return _decision_out(await _decision_or_404(db, project, decision_id))


@router.patch(_P + "/decisions/{decision_id}/")
async def update_decision(
    decision_id: str,
    payload: DecisionPatch,
    project: Project = Depends(require_project_write_access),
    db: AsyncSession = Depends(get_db),
) -> dict:
    row = await _decision_or_404(db, project, decision_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    await db.commit()
    return _decision_out(row)


@router.post(_P + "/decisions/{decision_id}/resolve/")
async def resolve_decision(
    decision_id: str,
    payload: ResolveDecisionPayload,
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Record the answer, who gave it and when. The selected option must be one of
    the options offered — a decision resolved to something nobody wrote down is
    not a record, it is a memory."""
    row = await _decision_or_404(db, project, decision_id)
    if row.status is EDecisionStatus.RESOLVED:
        raise structured_http(
            status.HTTP_409_CONFLICT, "decision_already_resolved",
            f"Already resolved as '{row.selected_option}'.", retryable=False,
        )
    offered = {str(o.get("key")) for o in (row.options or []) if isinstance(o, dict)}
    if offered and payload.selected_option not in offered:
        raise structured_http(
            status.HTTP_400_BAD_REQUEST, "unknown_option",
            f"'{payload.selected_option}' is not one of the recorded options "
            f"({', '.join(sorted(offered))}).",
            retryable=False,
        )
    row.status = EDecisionStatus.RESOLVED
    row.selected_option = payload.selected_option
    row.decided_by_id = ctx.user.id
    row.decided_by_name = ctx.user.display_name
    row.decided_at = datetime.now(timezone.utc)
    row.decision_note = payload.note
    await db.commit()
    return _decision_out(row)


# ──────────────────────────── Escalations ────────────────────────────


class EscalationIn(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    description: str = ""
    category: EEscalationCategory
    raised_to: str = ""
    needed_by: date | None = None
    blocker_id: str | None = None


class EscalationPatch(BaseModel):
    title: str | None = None
    description: str | None = None
    category: EEscalationCategory | None = None
    raised_to: str | None = None
    needed_by: date | None = None
    status: EEscalationStatus | None = None


class ResolveEscalationPayload(BaseModel):
    resolution: str = ""


def _escalation_out(row: ProjectEscalation) -> dict:
    return {
        "id": row.id,
        "project_id": row.project_id,
        "title": row.title,
        "description": row.description,
        "category": row.category.value,
        "status": row.status.value,
        "raised_to": row.raised_to,
        "raised_by_id": row.raised_by_id,
        "raised_by_name": row.raised_by_name,
        "needed_by": row.needed_by,
        "acknowledged_at": row.acknowledged_at,
        "resolved_at": row.resolved_at,
        "resolution": row.resolution,
        "blocker_id": row.blocker_id,
        "age_days": (datetime.now(timezone.utc) - _aware(row.created_at)).days,
        "overdue": (
            row.status is not EEscalationStatus.RESOLVED
            and row.needed_by is not None
            and row.needed_by < date.today()
        ),
        "created_at": row.created_at,
    }


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


async def _escalation_or_404(
    db: AsyncSession, project: Project, escalation_id: str
) -> ProjectEscalation:
    row = await db.get(ProjectEscalation, escalation_id)
    if row is None or row.project_id != project.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Escalation not found")
    return row


@router.post(_P + "/escalations/", status_code=status.HTTP_201_CREATED)
async def create_escalation(
    payload: EscalationIn,
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict:
    row = ProjectEscalation(
        project_id=project.id,
        raised_by_id=ctx.user.id,
        raised_by_name=ctx.user.display_name,
        **payload.model_dump(),
    )
    db.add(row)
    await notify_decision_makers(
        db,
        ctx.workspace.id,
        project.id,
        actor_id=ctx.user.id,
        title=f"Escalation: {row.title}",
        body=f"Raised by {row.raised_by_name}",
    )
    await db.commit()
    return _escalation_out(row)


@router.get(_P + "/escalations/")
async def list_escalations(
    status_filter: str | None = None,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
) -> dict:
    query = select(ProjectEscalation).where(ProjectEscalation.project_id == project.id)
    if status_filter:
        query = query.where(
            ProjectEscalation.status.in_(
                [s.strip() for s in status_filter.split(",") if s.strip()]
            )
        )
    else:
        query = query.where(ProjectEscalation.status != EEscalationStatus.RESOLVED)
    rows = list(
        (await db.execute(query.order_by(ProjectEscalation.created_at))).scalars().all()
    )
    items = [_escalation_out(r) for r in rows]
    return {
        "total": len(items),
        "overdue": sum(1 for i in items if i["overdue"]),
        "unacknowledged": sum(1 for i in items if i["status"] == "open"),
        "items": items,
    }


@router.get(_P + "/escalations/{escalation_id}/")
async def get_escalation(
    escalation_id: str,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return _escalation_out(await _escalation_or_404(db, project, escalation_id))


@router.patch(_P + "/escalations/{escalation_id}/")
async def update_escalation(
    escalation_id: str,
    payload: EscalationPatch,
    project: Project = Depends(require_project_write_access),
    db: AsyncSession = Depends(get_db),
) -> dict:
    row = await _escalation_or_404(db, project, escalation_id)
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(row, field, value)
    if changes.get("status") is EEscalationStatus.ACKNOWLEDGED and row.acknowledged_at is None:
        row.acknowledged_at = datetime.now(timezone.utc)
    await db.commit()
    return _escalation_out(row)


@router.post(_P + "/escalations/{escalation_id}/resolve/")
async def resolve_escalation(
    escalation_id: str,
    payload: ResolveEscalationPayload,
    project: Project = Depends(require_project_write_access),
    db: AsyncSession = Depends(get_db),
) -> dict:
    row = await _escalation_or_404(db, project, escalation_id)
    if row.status is EEscalationStatus.RESOLVED:
        raise structured_http(
            status.HTTP_409_CONFLICT, "escalation_already_resolved",
            "This escalation is already resolved.", retryable=False,
        )
    row.status = EEscalationStatus.RESOLVED
    row.resolved_at = datetime.now(timezone.utc)
    row.resolution = payload.resolution
    await db.commit()
    return _escalation_out(row)
