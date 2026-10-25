"""Autonomy policy, action approvals and the emergency stop (GIN-387).

Reading the policy needs project VIEW; changing it, pausing the director, and
approving or rejecting an action need MANAGE_SETTINGS — an agent must never be
able to widen its own limits or approve its own request.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import get_db
from gigsnano_api.features.autonomy.policy import (
    ActionRequest,
    Limits,
    PolicyView,
    evaluate,
)
from gigsnano_api.features.inbox.recipients import notify_decision_makers
from gigsnano_api.features.mutations import structured_http
from gigsnano_api.features.projects.router import record_activity
from gigsnano_api.models import (
    DEFAULT_RESTRICTED,
    EActionStatus,
    EDirectorAction,
    EProjectActivityType,
    Project,
    ProjectAutonomyPolicy,
    ProjectDirectorAction,
)
from gigsnano_api.shared.context import (
    WorkspaceContext,
    get_project_or_404,
    get_workspace_context,
    require_project_permission,
)
from gigsnano_api.shared.project_rbac import EProjectPermission

router = APIRouter(tags=["autonomy"])

_P = "/workspaces/{workspace_slug}/projects/{project_id}"
MAX_ACTIONS_PAGE = 200

_manage = require_project_permission(EProjectPermission.MANAGE_SETTINGS)


class UpdatePolicyPayload(BaseModel):
    max_items_per_run: int | None = Field(default=None, ge=1, le=1000)
    max_date_shift_days: int | None = Field(default=None, ge=0, le=365)
    max_priority_changes: int | None = Field(default=None, ge=0, le=1000)
    max_reassignments: int | None = Field(default=None, ge=0, le=1000)
    allowed_status_transitions: list[list[str]] | None = None
    restricted_actions: list[str] | None = None
    quiet_hours_start: int | None = Field(default=None, ge=0, le=23)
    quiet_hours_end: int | None = Field(default=None, ge=0, le=23)
    quiet_hours_timezone: str | None = None
    notification_channels: list[str] | None = None


class PausePayload(BaseModel):
    reason: str = ""


class RequestActionPayload(BaseModel):
    action: EDirectorAction
    reason: str = ""
    payload: dict | None = None
    correlation_id: str | None = None
    item_count: int = Field(default=1, ge=0)
    date_shift_days: int = 0
    priority_changes: int = Field(default=0, ge=0)
    reassignments: int = Field(default=0, ge=0)
    status_transition: list[str] | None = None


class DecisionPayload(BaseModel):
    note: str = ""


async def _policy_row(db: AsyncSession, project: Project) -> ProjectAutonomyPolicy:
    """The project's policy, created with the conservative defaults on first use —
    "never configured" must not mean "unlimited"."""
    row = (
        await db.execute(
            select(ProjectAutonomyPolicy).where(
                ProjectAutonomyPolicy.project_id == project.id
            )
        )
    ).scalar_one_or_none()
    if row is None:
        row = ProjectAutonomyPolicy(project_id=project.id)
        db.add(row)
        await db.flush()
    return row


def _view(row: ProjectAutonomyPolicy) -> PolicyView:
    transitions = row.allowed_status_transitions
    return PolicyView(
        paused=row.paused,
        paused_reason=row.paused_reason,
        limits=Limits(
            max_items_per_run=row.max_items_per_run,
            max_date_shift_days=row.max_date_shift_days,
            max_priority_changes=row.max_priority_changes,
            max_reassignments=row.max_reassignments,
        ),
        restricted_actions=tuple(
            row.restricted_actions if row.restricted_actions is not None else DEFAULT_RESTRICTED
        ),
        allowed_status_transitions=(
            tuple(tuple(t) for t in transitions) if transitions is not None else None
        ),
        quiet_hours_start=row.quiet_hours_start,
        quiet_hours_end=row.quiet_hours_end,
    )


def _policy_out(row: ProjectAutonomyPolicy) -> dict:
    return {
        "project_id": row.project_id,
        "paused": row.paused,
        "paused_reason": row.paused_reason,
        "paused_by_id": row.paused_by_id,
        "paused_at": row.paused_at,
        "limits": {
            "max_items_per_run": row.max_items_per_run,
            "max_date_shift_days": row.max_date_shift_days,
            "max_priority_changes": row.max_priority_changes,
            "max_reassignments": row.max_reassignments,
        },
        "allowed_status_transitions": row.allowed_status_transitions,
        "restricted_actions": (
            row.restricted_actions if row.restricted_actions is not None
            else list(DEFAULT_RESTRICTED)
        ),
        "quiet_hours": {
            "start": row.quiet_hours_start,
            "end": row.quiet_hours_end,
            "timezone": row.quiet_hours_timezone,
        },
        "notification_channels": row.notification_channels,
        "updated_at": row.updated_at,
    }


def _action_out(row: ProjectDirectorAction) -> dict:
    return {
        "id": row.id,
        "project_id": row.project_id,
        "action": row.action.value,
        "status": row.status.value,
        "reason": row.reason,
        "policy_reason": row.policy_reason,
        "payload": row.payload,
        "requested_by_id": row.requested_by_id,
        "requested_by_name": row.requested_by_name,
        "decided_by_id": row.decided_by_id,
        "decided_by_name": row.decided_by_name,
        "decided_at": row.decided_at,
        "decision_note": row.decision_note,
        "correlation_id": row.correlation_id,
        "result": row.result,
        "created_at": row.created_at,
    }


@router.get(_P + "/autonomy-policy/")
async def get_autonomy_policy(
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """The project's autonomy policy, materializing the defaults on first read."""
    row = await _policy_row(db, project)
    await db.commit()
    return _policy_out(row)


@router.patch(_P + "/autonomy-policy/")
async def update_autonomy_policy(
    payload: UpdatePolicyPayload,
    project: Project = Depends(_manage),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict:
    row = await _policy_row(db, project)
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(row, field, value)
    record_activity(
        db, project.id, EProjectActivityType.UPDATED, ctx.user,
        f"updated the autonomy policy ({', '.join(sorted(changes)) or 'no fields'})",
    )
    await db.commit()
    return _policy_out(row)


@router.post(_P + "/autonomy-policy/pause/")
async def pause_director(
    payload: PausePayload,
    project: Project = Depends(_manage),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Emergency stop. Takes effect on the next decision — reads keep working."""
    row = await _policy_row(db, project)
    row.paused = True
    row.paused_reason = payload.reason
    row.paused_by_id = ctx.user.id
    row.paused_at = datetime.now(timezone.utc)
    record_activity(
        db, project.id, EProjectActivityType.UPDATED, ctx.user,
        f"paused the project director{': ' + payload.reason if payload.reason else ''}",
    )
    await db.commit()
    return _policy_out(row)


@router.post(_P + "/autonomy-policy/resume/")
async def resume_director(
    project: Project = Depends(_manage),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict:
    row = await _policy_row(db, project)
    row.paused = False
    row.paused_reason = ""
    row.paused_by_id = None
    row.paused_at = None
    record_activity(
        db, project.id, EProjectActivityType.UPDATED, ctx.user, "resumed the project director"
    )
    await db.commit()
    return _policy_out(row)


@router.post(_P + "/director-actions/", status_code=status.HTTP_201_CREATED)
async def request_action(
    payload: RequestActionPayload,
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Ask the policy whether an action may proceed. Either answer is recorded:
    auto-approved actions are audited too, because "it was within policy" is a
    claim someone will need to check later."""
    row = await _policy_row(db, project)
    decision = evaluate(
        _view(row),
        ActionRequest(
            action=payload.action.value,
            item_count=payload.item_count,
            date_shift_days=payload.date_shift_days,
            priority_changes=payload.priority_changes,
            reassignments=payload.reassignments,
            status_transition=(
                tuple(payload.status_transition) if payload.status_transition else None
            ),
        ),
        now=datetime.now(timezone.utc),
    )
    action = ProjectDirectorAction(
        project_id=project.id,
        action=payload.action,
        status=EActionStatus.PENDING if decision.requires_approval else EActionStatus.AUTO_APPROVED,
        payload=payload.payload,
        reason=payload.reason,
        policy_reason=decision.summary,
        requested_by_id=ctx.user.id,
        requested_by_name=ctx.user.display_name,
        correlation_id=payload.correlation_id,
    )
    db.add(action)
    if action.status == EActionStatus.PENDING:
        await notify_decision_makers(
            db,
            ctx.workspace.id,
            project.id,
            actor_id=ctx.user.id,
            title=f"Approval needed: {action.action.value.replace('_', ' ').capitalize()}",
            body=(action.reason or "")[:300],
        )
    await db.commit()
    return {"decision": decision.as_dict(), "action": _action_out(action)}


@router.get(_P + "/director-actions/")
async def list_actions(
    status_filter: str | None = None,
    limit: int = 50,
    offset: int = 0,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
) -> dict:
    query = select(ProjectDirectorAction).where(ProjectDirectorAction.project_id == project.id)
    if status_filter:
        wanted = [s.strip() for s in status_filter.split(",") if s.strip()]
        query = query.where(ProjectDirectorAction.status.in_(wanted))
    rows = list(
        (await db.execute(query.order_by(ProjectDirectorAction.created_at.desc()))).scalars().all()
    )
    window = rows[max(offset, 0) : max(offset, 0) + max(1, min(limit, MAX_ACTIONS_PAGE))]
    return {
        "total": len(rows),
        "returned": len(window),
        "truncated": len(window) < len(rows),
        "items": [_action_out(r) for r in window],
    }


async def _pending_or_404(
    db: AsyncSession, project: Project, action_id: str
) -> ProjectDirectorAction:
    row = await db.get(ProjectDirectorAction, action_id)
    if row is None or row.project_id != project.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Action not found")
    if row.status is not EActionStatus.PENDING:
        raise structured_http(
            status.HTTP_409_CONFLICT,
            "action_already_decided",
            f"This action is already {row.status.value}; decisions are immutable.",
            retryable=False,
            current_status=row.status.value,
        )
    return row


@router.get(_P + "/director-actions/{action_id}/")
async def get_action(
    action_id: str,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
) -> dict:
    row = await db.get(ProjectDirectorAction, action_id)
    if row is None or row.project_id != project.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Action not found")
    return _action_out(row)


async def _decide(
    db: AsyncSession, project: Project, ctx: WorkspaceContext,
    action_id: str, note: str, *, approved: bool,
) -> dict:
    row = await _pending_or_404(db, project, action_id)
    row.status = EActionStatus.APPROVED if approved else EActionStatus.REJECTED
    row.decided_by_id = ctx.user.id
    row.decided_by_name = ctx.user.display_name
    row.decided_at = datetime.now(timezone.utc)
    row.decision_note = note
    record_activity(
        db, project.id, EProjectActivityType.UPDATED, ctx.user,
        f"{'approved' if approved else 'rejected'} director action {row.action.value}",
    )
    await db.commit()
    return _action_out(row)


@router.post(_P + "/director-actions/{action_id}/approve/")
async def approve_action(
    action_id: str,
    payload: DecisionPayload,
    project: Project = Depends(_manage),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Approve a pending action. The decision records who and when, and cannot be
    changed afterwards — an audit trail you can edit is not one."""
    return await _decide(db, project, ctx, action_id, payload.note, approved=True)


@router.post(_P + "/director-actions/{action_id}/reject/")
async def reject_action(
    action_id: str,
    payload: DecisionPayload,
    project: Project = Depends(_manage),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await _decide(db, project, ctx, action_id, payload.note, approved=False)
