"""The mobile Inbox: everything waiting on the caller, read live from the pending rows.

Built from the entities themselves (not notification rows) so a decision taken on web
disappears here on the next read.
"""

from dataclasses import dataclass

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.features.inbox.schemas import InboxCountsOut, InboxItemOut, InboxOut
from gigsnano_api.models import (
    Delegation,
    EActionStatus,
    EDelegationStatus,
    EEscalationStatus,
    EMemberStatus,
    ENotificationKind,
    EPlanStatus,
    Notification,
    Project,
    ProjectDirectorAction,
    ProjectEscalation,
    ProjectMember,
    RecoveryPlan,
    Story,
)
from gigsnano_api.shared.context import WorkspaceContext, accessible_project_ids
from gigsnano_api.shared.project_rbac import EProjectPermission, can

APPROVAL_KINDS = {"director_action", "recovery_plan", "delegation_review"}
ASSIGNED_KINDS = {"assignment", "mention"}


@dataclass(frozen=True)
class _Scope:
    names: dict[str, str]  # visible project id -> name
    decides: list[str]  # visible projects where the caller may take decisions


async def _scope(db: AsyncSession, ctx: WorkspaceContext) -> _Scope:
    ids = await accessible_project_ids(db, ctx)
    q = select(Project.id, Project.name).where(Project.workspace_id == ctx.workspace.id)
    if ids is not None:
        q = q.where(Project.id.in_(ids))
    names = {pid: name for pid, name in (await db.execute(q)).all()}
    role_rows = await db.execute(
        select(ProjectMember.project_id, ProjectMember.role).where(
            ProjectMember.user_id == ctx.user.id,
            ProjectMember.status == EMemberStatus.ACTIVE,
            ProjectMember.project_id.in_(list(names)),
        )
    )
    roles = {pid: role for pid, role in role_rows.all()}
    decides = [
        pid
        for pid in names
        if can(ctx.role, roles.get(pid), EProjectPermission.MANAGE_SETTINGS)
    ]
    return _Scope(names, decides)


def _clip(text: str, limit: int = 140) -> str:
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _item(scope: _Scope, kind, entity_id, project_id, title, subtitle, created_at, actions,
          story_id=None, href=None) -> InboxItemOut:
    return InboxItemOut(
        id=f"{kind}:{entity_id}", kind=kind, entity_id=entity_id, project_id=project_id,
        project_name=scope.names.get(project_id) if project_id else None,
        story_id=story_id, href=href, title=title, subtitle=subtitle,
        created_at=created_at, actions=actions,
    )


async def _decision_items(db: AsyncSession, scope: _Scope, limit: int) -> list[InboxItemOut]:
    items: list[InboxItemOut] = []
    for a in (await db.execute(
        select(ProjectDirectorAction).where(
            ProjectDirectorAction.project_id.in_(scope.decides),
            ProjectDirectorAction.status == EActionStatus.PENDING,
        ).order_by(ProjectDirectorAction.created_at.desc(), ProjectDirectorAction.id.desc()).limit(limit)
    )).scalars():
        title = a.action.value.replace("_", " ").capitalize()
        items.append(_item(scope, "director_action", a.id, a.project_id, title, _clip(a.reason),
                           a.created_at, ["approve", "reject"]))
    for p in (await db.execute(
        select(RecoveryPlan).where(
            RecoveryPlan.project_id.in_(scope.decides),
            RecoveryPlan.status == EPlanStatus.DRAFT,
        ).order_by(RecoveryPlan.created_at.desc(), RecoveryPlan.id.desc()).limit(limit)
    )).scalars():
        items.append(_item(scope, "recovery_plan", p.id, p.project_id, p.title, _clip(p.summary),
                           p.created_at, ["approve", "reject"]))
    for e in (await db.execute(
        select(ProjectEscalation).where(
            ProjectEscalation.project_id.in_(scope.decides),
            ProjectEscalation.status != EEscalationStatus.RESOLVED,
        ).order_by(ProjectEscalation.created_at.desc(), ProjectEscalation.id.desc()).limit(limit)
    )).scalars():
        subtitle = f"Raised by {e.raised_by_name}" if e.raised_by_name else ""
        items.append(_item(scope, "escalation", e.id, e.project_id, e.title, subtitle,
                           e.created_at, ["resolve"]))
    return items


async def _delegation_items(
    db: AsyncSession, ctx: WorkspaceContext, scope: _Scope, limit: int
) -> list[InboxItemOut]:
    items: list[InboxItemOut] = []
    for d, story_title in (await db.execute(
        select(Delegation, Story.title)
        .outerjoin(Story, (Story.id == Delegation.unit_id) & (Story.project_id == Delegation.project_id))
        .where(
            Delegation.project_id.in_(list(scope.names)),
            Delegation.delegated_by == ctx.user.id,
            Delegation.status == EDelegationStatus.AWAITING_REVIEW,
        ).order_by(Delegation.created_at.desc(), Delegation.id.desc()).limit(limit)
    )).all():
        items.append(_item(scope, "delegation_review", d.id, d.project_id,
                           story_title or "Agent work", "Agent output ready for review",
                           d.created_at, ["open", "retry"], story_id=d.unit_id))
    return items


async def _notification_items(
    db: AsyncSession, ctx: WorkspaceContext, scope: _Scope, limit: int
) -> list[InboxItemOut]:
    return [
        _item(scope, n.kind.value, n.id, n.project_id, n.title, _clip(n.body or ""),
              n.created_at, ["open"], href=n.href)
        for n in (await db.execute(
            select(Notification).where(
                Notification.receiver_id == ctx.user.id,
                Notification.workspace_id == ctx.workspace.id,
                Notification.read.is_(False),
                Notification.kind.in_([ENotificationKind.ASSIGNMENT, ENotificationKind.MENTION]),
                or_(Notification.project_id.is_(None),
                    Notification.project_id.in_(list(scope.names))),
            ).order_by(Notification.created_at.desc(), Notification.id.desc()).limit(limit)
        )).scalars()
    ]


async def build_inbox(db: AsyncSession, ctx: WorkspaceContext, *, limit: int = 100) -> InboxOut:
    scope = await _scope(db, ctx)
    items: list[InboxItemOut] = []
    if scope.decides:
        items += await _decision_items(db, scope, limit)
    if scope.names:
        items += await _delegation_items(db, ctx, scope, limit)
    items += await _notification_items(db, ctx, scope, limit)

    items.sort(key=lambda i: (i.created_at, i.id), reverse=True)
    approvals = sum(i.kind in APPROVAL_KINDS for i in items)
    escalations = sum(i.kind == "escalation" for i in items)
    assigned = sum(i.kind in ASSIGNED_KINDS for i in items)
    return InboxOut(
        items=items[:limit],
        counts=InboxCountsOut(approvals=approvals, escalations=escalations, assigned=assigned,
                              total=approvals + escalations + assigned),
    )
