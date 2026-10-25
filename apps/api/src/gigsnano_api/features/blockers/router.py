"""Blocker endpoints (GIN-383).

Raising and resolving a blocker is delivery work (project DELIVER), same tier as
editing the work item it is attached to. Every change writes a story-activity row,
so a blocker's life shows up in the item's history rather than only in a side
table nobody opens.
"""

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import get_db
from gigsnano_api.features.mutations import structured_http
from gigsnano_api.features.stories.activity import record_story_activity
from gigsnano_api.features.stories.service import _get_story_or_404
from gigsnano_api.models import (
    EBlockerImpact,
    EBlockerStatus,
    EEscalationLevel,
    EStoryActivityField,
    EStoryActivityKind,
    Project,
    Story,
    WorkItemBlocker,
)
from gigsnano_api.shared.context import (
    WorkspaceContext,
    get_project_or_404,
    get_workspace_context,
    require_project_write_access,
)

router = APIRouter(tags=["blockers"])

_P = "/workspaces/{workspace_slug}/projects/{project_id}"


class CreateBlockerPayload(BaseModel):
    reason: str = Field(min_length=1, max_length=4000)
    blocking_code: str | None = None  # a work item, by code
    external_dependency: str = ""
    impact: EBlockerImpact = EBlockerImpact.MEDIUM
    owner_id: str | None = None
    expected_resolution_date: date | None = None
    escalation_level: EEscalationLevel = EEscalationLevel.NONE


class UpdateBlockerPayload(BaseModel):
    reason: str | None = None
    external_dependency: str | None = None
    impact: EBlockerImpact | None = None
    owner_id: str | None = None
    expected_resolution_date: date | None = None
    escalation_level: EEscalationLevel | None = None


class ResolvePayload(BaseModel):
    resolution_evidence: str = ""
    cancelled: bool = False  # it was never really blocking


class EscalatePayload(BaseModel):
    level: EEscalationLevel
    note: str = ""


def _blocker_out(row: WorkItemBlocker, *, code: str, blocking_code: str | None) -> dict:
    return {
        "id": row.id,
        "project_id": row.project_id,
        "story_id": row.story_id,
        "code": code,
        "blocking_story_id": row.blocking_story_id,
        "blocking_code": blocking_code,
        "external_dependency": row.external_dependency,
        "reason": row.reason,
        "status": row.status.value,
        "impact": row.impact.value,
        "escalation_level": row.escalation_level.value,
        "owner_id": row.owner_id,
        "raised_by_id": row.raised_by_id,
        "raised_by_name": row.raised_by_name,
        "expected_resolution_date": row.expected_resolution_date,
        "resolved_at": row.resolved_at,
        "resolved_by_id": row.resolved_by_id,
        "resolution_evidence": row.resolution_evidence,
        "created_at": row.created_at,
        "age_days": (datetime.now(timezone.utc) - _aware(row.created_at)).days,
        "overdue": (
            row.status is EBlockerStatus.OPEN
            and row.expected_resolution_date is not None
            and row.expected_resolution_date < date.today()
        ),
    }


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _code(project: Project, story: Story | None) -> str | None:
    return f"{project.identifier}-{story.story_number}" if story else None


async def _story_by_code(db: AsyncSession, project: Project, code: str) -> Story:
    identifier, _, num = code.rpartition("-")
    if not identifier or not num.isdigit() or identifier.upper() != project.identifier.upper():
        raise structured_http(
            status.HTTP_400_BAD_REQUEST, "bad_code",
            f"'{code}' is not a work-item code in this project.", retryable=False,
        )
    story = (
        await db.execute(
            select(Story).where(
                Story.project_id == project.id, Story.story_number == int(num)
            )
        )
    ).scalar_one_or_none()
    if story is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No work item '{code}'")
    return story


async def _blocker_or_404(db: AsyncSession, project: Project, blocker_id: str) -> WorkItemBlocker:
    row = await db.get(WorkItemBlocker, blocker_id)
    if row is None or row.project_id != project.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Blocker not found")
    return row


async def _out(db: AsyncSession, project: Project, row: WorkItemBlocker) -> dict:
    story = await db.get(Story, row.story_id)
    blocking = await db.get(Story, row.blocking_story_id) if row.blocking_story_id else None
    return _blocker_out(row, code=_code(project, story) or "", blocking_code=_code(project, blocking))


@router.post(_P + "/stories/{story_id}/blockers/", status_code=status.HTTP_201_CREATED)
async def create_blocker(
    story_id: str,
    payload: CreateBlockerPayload,
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Mark a work item blocked. Either name the blocking work item by code, or
    describe the external dependency — a blocker with neither is just a comment."""
    story = await _get_story_or_404(db, project, story_id)
    if not payload.blocking_code and not payload.external_dependency.strip():
        raise structured_http(
            status.HTTP_400_BAD_REQUEST, "missing_blocking_source",
            "Name the blocking work item (blocking_code) or the external dependency.",
            retryable=False,
        )
    blocking = (
        await _story_by_code(db, project, payload.blocking_code) if payload.blocking_code else None
    )
    if blocking is not None and blocking.id == story.id:
        raise structured_http(
            status.HTTP_400_BAD_REQUEST, "self_block",
            "A work item cannot block itself.", retryable=False,
        )
    row = WorkItemBlocker(
        project_id=project.id,
        story_id=story.id,
        blocking_story_id=blocking.id if blocking else None,
        external_dependency=payload.external_dependency.strip(),
        reason=payload.reason,
        impact=payload.impact,
        escalation_level=payload.escalation_level,
        owner_id=payload.owner_id,
        raised_by_id=ctx.user.id,
        raised_by_name=ctx.user.display_name,
        expected_resolution_date=payload.expected_resolution_date,
    )
    db.add(row)
    record_story_activity(
        db, story.id, ctx.user,
        kind=EStoryActivityKind.PROPERTY, field=EStoryActivityField.RELATION,
        summary=f"blocked: {payload.reason[:120]}",
        new_value=payload.blocking_code or payload.external_dependency,
    )
    await db.commit()
    return await _out(db, project, row)


@router.get(_P + "/stories/{story_id}/blockers/")
async def list_story_blockers(
    story_id: str,
    include_resolved: bool = False,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    await _get_story_or_404(db, project, story_id)
    query = select(WorkItemBlocker).where(WorkItemBlocker.story_id == story_id)
    if not include_resolved:
        query = query.where(WorkItemBlocker.status == EBlockerStatus.OPEN)
    rows = (await db.execute(query.order_by(WorkItemBlocker.created_at))).scalars().all()
    return [await _out(db, project, r) for r in rows]


@router.get(_P + "/blockers/")
async def list_project_blockers(
    status_filter: str | None = None,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """The project's blockers, oldest first — age is the point of this list."""
    query = select(WorkItemBlocker).where(WorkItemBlocker.project_id == project.id)
    if status_filter:
        query = query.where(
            WorkItemBlocker.status.in_([s.strip() for s in status_filter.split(",") if s.strip()])
        )
    else:
        query = query.where(WorkItemBlocker.status == EBlockerStatus.OPEN)
    rows = list((await db.execute(query.order_by(WorkItemBlocker.created_at))).scalars().all())
    items = [await _out(db, project, r) for r in rows]
    return {
        "total": len(items),
        "open": sum(1 for i in items if i["status"] == "open"),
        "overdue": sum(1 for i in items if i["overdue"]),
        "escalated": sum(1 for i in items if i["escalation_level"] != "none"),
        "items": items,
    }


@router.patch(_P + "/blockers/{blocker_id}/")
async def update_blocker(
    blocker_id: str,
    payload: UpdateBlockerPayload,
    project: Project = Depends(require_project_write_access),
    db: AsyncSession = Depends(get_db),
) -> dict:
    row = await _blocker_or_404(db, project, blocker_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    await db.commit()
    return await _out(db, project, row)


@router.post(_P + "/blockers/{blocker_id}/resolve/")
async def resolve_blocker(
    blocker_id: str,
    payload: ResolvePayload,
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Clear a blocker. Resolving asks for evidence; cancelling (it was never
    really blocking) does not, and says so in the status rather than pretending
    the impediment was overcome."""
    row = await _blocker_or_404(db, project, blocker_id)
    if row.status is not EBlockerStatus.OPEN:
        raise structured_http(
            status.HTTP_409_CONFLICT, "blocker_not_open",
            f"This blocker is already {row.status.value}.", retryable=False,
        )
    row.status = EBlockerStatus.CANCELLED if payload.cancelled else EBlockerStatus.RESOLVED
    row.resolved_at = datetime.now(timezone.utc)
    row.resolved_by_id = ctx.user.id
    row.resolution_evidence = payload.resolution_evidence
    record_story_activity(
        db, row.story_id, ctx.user,
        kind=EStoryActivityKind.PROPERTY, field=EStoryActivityField.RELATION,
        summary=f"blocker {row.status.value}",
        new_value=payload.resolution_evidence or None,
    )
    await db.commit()
    return await _out(db, project, row)


@router.post(_P + "/blockers/{blocker_id}/escalate/")
async def escalate_blocker(
    blocker_id: str,
    payload: EscalatePayload,
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Raise the escalation level. Escalation only goes up — walking it back
    quietly is how an impediment stops being anyone's problem."""
    row = await _blocker_or_404(db, project, blocker_id)
    order = list(EEscalationLevel)
    if order.index(payload.level) <= order.index(row.escalation_level):
        raise structured_http(
            status.HTTP_409_CONFLICT, "escalation_not_higher",
            f"Blocker is already escalated to {row.escalation_level.value}; "
            f"escalation only moves up.",
            retryable=False,
        )
    row.escalation_level = payload.level
    record_story_activity(
        db, row.story_id, ctx.user,
        kind=EStoryActivityKind.PROPERTY, field=EStoryActivityField.RELATION,
        summary=f"blocker escalated to {payload.level.value}"
        + (f": {payload.note}" if payload.note else ""),
    )
    await db.commit()
    return await _out(db, project, row)
