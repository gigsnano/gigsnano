"""Workspace notification feed + the notify() emit seam other domains call."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.models import User
from gigsnano_api.bmad.unlock import sprint_zero_status
from gigsnano_api.core.db import get_db
from gigsnano_api.core.pagination import OffsetPageOut
from gigsnano_api.email.provider import EmailProvider
from gigsnano_api.features.notifications.schemas import (
    MarkReadPayload,
    NotificationActor,
    NotificationOut,
    NotificationProjectRef,
    UnreadNotificationsOut,
)
from gigsnano_api.lib.mentions import resolve_mention_user_ids
from gigsnano_api.models import (
    EMemberStatus,
    ENotificationKind,
    EReadinessResult,
    EWorkspaceRole,
    Notification,
    Project,
    ProjectMember,
    PushOutbox,
    Story,
    StorySubscription,
    Workspace,
    WorkspaceMember,
)
from gigsnano_api.notifications.render import get_template_by_key, render_template
from gigsnano_api.shared.context import WorkspaceContext, get_workspace_context_incl_pending

router = APIRouter(tags=["notifications"])

_W = "/workspaces/{workspace_slug}"


async def is_active_workspace_member(db: AsyncSession, workspace_id: str, user_id: str) -> bool:
    result = await db.execute(
        select(WorkspaceMember.id).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
            WorkspaceMember.status == EMemberStatus.ACTIVE,
        )
    )
    return result.scalar_one_or_none() is not None


async def is_active_project_member(db: AsyncSession, project_id: str, user_id: str) -> bool:
    result = await db.execute(
        select(ProjectMember.id).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
            ProjectMember.status == EMemberStatus.ACTIVE,
        )
    )
    return result.scalar_one_or_none() is not None


async def active_project_member_ids(db: AsyncSession, project_id: str) -> list[str]:
    result = await db.execute(
        select(ProjectMember.user_id).where(
            ProjectMember.project_id == project_id,
            ProjectMember.status == EMemberStatus.ACTIVE,
        )
    )
    return list(result.scalars().all())


async def workspace_admin_user_ids(db: AsyncSession, workspace_id: str) -> list[str]:
    result = await db.execute(
        select(WorkspaceMember.user_id).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.status == EMemberStatus.ACTIVE,
            WorkspaceMember.role.in_((EWorkspaceRole.ADMIN, EWorkspaceRole.OWNER)),
        )
    )
    return list(result.scalars().all())


async def notify_readiness_transition(
    db: AsyncSession,
    project: Project,
    workspace_slug: str,
    *,
    old: EReadinessResult | None,
    new: EReadinessResult | None,
    triggered_by_id: str,
    background=None,
    provider: EmailProvider | None = None,
) -> None:
    """N-31: notify project lead + workspace admins on transition into concerns/fail."""
    if new is None or new == old or new == EReadinessResult.PASS:
        return
    trigger_key = (
        "readiness.concerns" if new == EReadinessResult.CONCERNS else "readiness.fail"
    )
    recipients: set[str] = set(await workspace_admin_user_ids(db, project.workspace_id))
    if project.lead_id:
        recipients.add(project.lead_id)
    recipients.discard(triggered_by_id)
    href = f"/{workspace_slug}/projects/{project.id}/board"
    for user_id in recipients:
        await resolve_and_notify(
            db,
            project.workspace_id,
            user_id,
            trigger_key=trigger_key,
            context={"project": project.name},
            kind=ENotificationKind.SYSTEM,
            href=href,
            triggered_by_id=triggered_by_id,
            project_id=project.id,
            require_project_member=False,
            background=background,
            provider=provider,
        )


async def notify_plan_changed(
    db: AsyncSession,
    workspace_id: str,
    *,
    tier_label: str,
    background=None,
    provider: EmailProvider | None = None,
    triggered_by_id: str | None = None,
) -> None:
    """Notify + email workspace admins that the subscription plan changed
    (upgrade, downgrade, or cancel-to-Free). GIN-129: subscription changes never
    fired the notification/email seam that top-ups already use."""
    ws = await db.get(Workspace, workspace_id)
    if ws is None:
        return
    href = f"/{ws.slug}/settings/billing"
    for admin_id in await workspace_admin_user_ids(db, workspace_id):
        await resolve_and_notify(
            db,
            workspace_id,
            admin_id,
            trigger_key="billing.plan_changed",
            context={"workspace": ws.name, "plan": tier_label},
            kind=ENotificationKind.SYSTEM,
            href=href,
            triggered_by_id=triggered_by_id,
            require_project_member=False,
            transactional=True,
            background=background,
            provider=provider,
        )


async def notify_invoice_paid(
    db: AsyncSession,
    workspace_id: str,
    *,
    amount: str,
    invoice_url: str | None,
    background=None,
    provider: EmailProvider | None = None,
) -> None:
    """Email workspace admins a copy of the paid invoice on each subscription
    payment (Stripe `invoice.payment_succeeded`). GIN-129: recurring monthly
    receipt with a link to the hosted invoice/PDF."""
    ws = await db.get(Workspace, workspace_id)
    if ws is None:
        return
    # href is the in-app billing page (the bridge prefixes app_base_url); the Stripe
    # hosted-invoice link is passed as a template var, rendered as a full <a> href.
    href = f"/{ws.slug}/settings/billing"
    for admin_id in await workspace_admin_user_ids(db, workspace_id):
        await resolve_and_notify(
            db,
            workspace_id,
            admin_id,
            trigger_key="billing.invoice_paid",
            context={"workspace": ws.name, "amount": amount,
                     "invoice_url": invoice_url or ""},
            kind=ENotificationKind.SYSTEM,
            href=href,
            require_project_member=False,
            transactional=True,
            background=background,
            provider=provider,
        )


_PUSH_KINDS = {
    ENotificationKind.MENTION,
    ENotificationKind.ASSIGNMENT,
    ENotificationKind.REVIEW,
    ENotificationKind.AGENT,
}


async def notify(
    db: AsyncSession,
    workspace_id: str,
    *,
    receiver_id: str,
    kind: ENotificationKind,
    title: str,
    body: str = "",
    href: str | None = None,
    triggered_by_id: str | None = None,
    project_id: str | None = None,
) -> None:
    """Insert one row for one recipient. No commit — participates in the caller's transaction."""
    db.add(
        Notification(
            workspace_id=workspace_id,
            receiver_id=receiver_id,
            triggered_by_id=triggered_by_id,
            project_id=project_id,
            kind=kind,
            title=title,
            body=body,
            href=href,
        )
    )
    if kind in _PUSH_KINDS:
        db.add(
            PushOutbox(
                user_id=receiver_id,
                category="realtime",
                title=title[:200],
                body=body[:300],
                data={"route": "/inbox"},
            )
        )


async def resolve_and_notify(
    db: AsyncSession,
    workspace_id: str,
    receiver_id: str,
    *,
    trigger_key: str,
    context: dict[str, str],
    kind: ENotificationKind,
    href: str | None,
    triggered_by_id: str | None = None,
    project_id: str | None = None,
    require_active_member: bool = True,
    require_project_member: bool = True,
    transactional: bool = False,
    background=None,
    provider: EmailProvider | None = None,
) -> None:
    if require_active_member and not await is_active_workspace_member(db, workspace_id, receiver_id):
        return
    if (
        project_id is not None
        and require_project_member
        and not await is_active_project_member(db, project_id, receiver_id)
    ):
        return
    tpl = await get_template_by_key(db, trigger_key)
    if tpl is None or not tpl.enabled:
        return
    title, body = render_template(tpl.title_template, tpl.body_template, context)
    await notify(
        db,
        workspace_id,
        receiver_id=receiver_id,
        kind=tpl.kind,
        title=title,
        body=body,
        href=href,
        triggered_by_id=triggered_by_id,
        project_id=project_id,
    )
    if tpl.email_enabled and background is not None and provider is not None:
        receiver = await db.get(User, receiver_id)
        # Transactional mail (billing receipts, invoices) must reach the user even
        # if they opted out of the digest — email_digest is the *marketing* opt-out,
        # not a switch for financial/account mail (GIN-129).
        opted_in = transactional or (receiver is not None and receiver.email_digest)
        if receiver is not None and opted_in and receiver.email:
            from gigsnano_api.core.config import settings
            from gigsnano_api.email.messages import email_shell
            from gigsnano_api.email.router import make_unsubscribe_url
            from gigsnano_api.email.send import send_email_in_background

            email_context = {
                "url": (settings.app_base_url + href) if href else settings.app_base_url,
                **context,
            }
            email_subject, email_body = render_template(
                tpl.email_subject_template, tpl.email_body_html_template, email_context
            )
            html = email_shell(
                email_subject, email_body, unsubscribe_url=make_unsubscribe_url(receiver_id)
            )
            background.add_task(
                send_email_in_background, provider, receiver.email, email_subject, html
            )


def story_notification_href(slug: str, project_id: str, story: Story) -> str:
    base = f"/{slug}/projects/{project_id}"
    if story.bmad_workflow is not None:
        return f"{base}/board?openWorkflow={story.bmad_workflow}"
    if story.bmad_agent is not None:
        return f"{base}/board?openStory={story.id}"
    return f"{base}/issues/{story.id}"


def document_notification_href(slug: str, document_id: str) -> str:
    return f"/{slug}/docs/{document_id}"


async def emit_document_mentions(
    db: AsyncSession,
    project: Project,
    *,
    document_id: str,
    document_title: str,
    workspace_slug: str,
    actor_id: str,
    actor_name: str,
    text: str,
    background=None,
    provider: EmailProvider | None = None,
) -> None:
    for user_id in await resolve_mention_user_ids(db, project.workspace_id, project.id, text):
        if user_id == actor_id:
            continue
        await resolve_and_notify(
            db,
            project.workspace_id,
            user_id,
            trigger_key="mention.document",
            context={"actor": actor_name, "document": document_title},
            kind=ENotificationKind.MENTION,
            href=document_notification_href(workspace_slug, document_id),
            triggered_by_id=actor_id,
            project_id=project.id,
            background=background,
            provider=provider,
        )


async def emit_story_mentions(
    db: AsyncSession,
    project: Project,
    story: Story,
    workspace_slug: str,
    *,
    actor_id: str,
    actor_name: str,
    text: str,
    background=None,
    provider: EmailProvider | None = None,
) -> None:
    for user_id in await resolve_mention_user_ids(db, project.workspace_id, project.id, text):
        if user_id == actor_id:
            continue
        await resolve_and_notify(
            db,
            project.workspace_id,
            user_id,
            trigger_key="mention.story",
            context={"actor": actor_name, "story": story.title},
            kind=ENotificationKind.MENTION,
            href=story_notification_href(workspace_slug, project.id, story),
            triggered_by_id=actor_id,
            project_id=project.id,
            background=background,
            provider=provider,
        )


async def notify_story_watchers(
    db: AsyncSession,
    story: Story,
    project: Project,
    workspace_id: str,
    workspace_slug: str,
    *,
    trigger_key: str,
    context: dict[str, str],
    kind: ENotificationKind,
    actor_id: str,
    background=None,
    provider: EmailProvider | None = None,
) -> None:
    """Notify assignee + subscribers, minus the actor and non–project-members."""
    watcher_ids: set[str] = set()
    if story.assignee_id:
        watcher_ids.add(story.assignee_id)
    subs = (
        await db.execute(
            select(StorySubscription.user_id).where(StorySubscription.story_id == story.id)
        )
    ).scalars().all()
    watcher_ids.update(subs)
    watcher_ids.discard(actor_id)

    href = story_notification_href(workspace_slug, project.id, story)
    for user_id in watcher_ids:
        await resolve_and_notify(
            db,
            workspace_id,
            user_id,
            trigger_key=trigger_key,
            context=context,
            kind=kind,
            href=href,
            triggered_by_id=actor_id,
            project_id=project.id,
            background=background,
            provider=provider,
        )


async def notify_project_members(
    db: AsyncSession,
    workspace_id: str,
    project_id: str,
    *,
    trigger_key: str,
    context: dict[str, str],
    kind: ENotificationKind,
    href: str | None = None,
    triggered_by_id: str | None = None,
    exclude_user_ids: set[str] | None = None,
    background=None,
    provider: EmailProvider | None = None,
) -> None:
    """Fan-out one row per active project member via template resolution. No commit."""
    exclude = exclude_user_ids or set()
    for member_id in await active_project_member_ids(db, project_id):
        if member_id in exclude:
            continue
        await resolve_and_notify(
            db,
            workspace_id,
            member_id,
            trigger_key=trigger_key,
            context=context,
            kind=kind,
            href=href,
            triggered_by_id=triggered_by_id,
            project_id=project_id,
            background=background,
            provider=provider,
        )


async def sprint_zero_complete(db: AsyncSession, project_id: str) -> bool:
    """True when a project's Sprint-0 is complete (all required cards done)."""
    s0 = (
        await db.execute(
            select(Story).where(Story.project_id == project_id, Story.bmad_workflow.is_not(None))
        )
    ).scalars().all()
    return sprint_zero_status(list(s0)) == "complete"


def _out(
    n: Notification,
    slug: str,
    actors: dict[str, User] | None = None,
    projects: dict[str, Project] | None = None,
) -> NotificationOut:
    actor = (actors or {}).get(n.triggered_by_id) if n.triggered_by_id else None
    project = (projects or {}).get(n.project_id) if n.project_id else None
    return NotificationOut(
        id=n.id,
        workspace_slug=slug,
        kind=n.kind,
        title=n.title,
        body=n.body,
        href=n.href,
        read=n.read,
        created_at=n.created_at,
        actor=(
            NotificationActor(
                id=actor.id, display_name=actor.display_name, avatar_url=actor.avatar_url
            )
            if actor
            else None
        ),
        project=(
            NotificationProjectRef(id=project.id, name=project.name) if project else None
        ),
    )


# GIN-270/293: primary Inbox filter tabs → kind sets. Server-authoritative so the
# mapping can evolve without a frontend change.
def _category_clauses(category: str):
    if category == "unread":
        return (Notification.read.is_(False),)
    if category == "mentions":
        return (Notification.kind == ENotificationKind.MENTION,)
    if category == "assigned":
        return (Notification.kind == ENotificationKind.ASSIGNMENT,)
    if category == "reviews":
        return (Notification.kind == ENotificationKind.REVIEW,)
    if category == "agent_system":
        return (
            Notification.kind.in_(
                (
                    ENotificationKind.AGENT,
                    ENotificationKind.SYSTEM,
                    ENotificationKind.SPRINT,
                )
            ),
        )
    return ()  # "all"


@router.get(f"{_W}/notifications/", response_model=OffsetPageOut[NotificationOut])
async def list_notifications(
    limit: int = 30,
    offset: int = 0,
    category: str = "all",
    ctx: WorkspaceContext = Depends(get_workspace_context_incl_pending),
    db: AsyncSession = Depends(get_db),
):
    limit = max(1, min(limit, 100))
    offset = max(0, offset)
    base = (
        Notification.workspace_id == ctx.workspace.id,
        Notification.receiver_id == ctx.user.id,
        *_category_clauses(category),
    )
    total = int(
        (await db.scalar(select(func.count(Notification.id)).where(*base))) or 0
    )
    rows = (
        await db.execute(
            select(Notification)
            .where(*base)
            .order_by(Notification.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).scalars().all()

    # Batch-fetch actors + projects for the page (no N+1, no ORM relationship needed).
    actor_ids = {n.triggered_by_id for n in rows if n.triggered_by_id}
    project_ids = {n.project_id for n in rows if n.project_id}
    actors = {
        u.id: u
        for u in (
            await db.execute(select(User).where(User.id.in_(actor_ids)))
        ).scalars().all()
    } if actor_ids else {}
    projects = {
        p.id: p
        for p in (
            await db.execute(select(Project).where(Project.id.in_(project_ids)))
        ).scalars().all()
    } if project_ids else {}

    items = [_out(n, ctx.workspace.slug, actors, projects) for n in rows]
    return OffsetPageOut(items=items, total=total, limit=limit, offset=offset)


@router.get(f"{_W}/notifications/unread/", response_model=UnreadNotificationsOut)
async def unread_notifications(
    ctx: WorkspaceContext = Depends(get_workspace_context_incl_pending),
    db: AsyncSession = Depends(get_db),
):
    base = (
        Notification.workspace_id == ctx.workspace.id,
        Notification.receiver_id == ctx.user.id,
        Notification.read.is_(False),
    )
    total = (
        await db.execute(select(func.count()).select_from(Notification).where(*base))
    ).scalar_one()
    mention = (
        await db.execute(
            select(func.count())
            .select_from(Notification)
            .where(*base, Notification.kind == ENotificationKind.MENTION)
        )
    ).scalar_one()
    return UnreadNotificationsOut(total_unread=total, mention_unread=mention)


@router.patch(f"{_W}/notifications/{{notification_id}}/", response_model=NotificationOut)
async def mark_read(
    notification_id: str,
    payload: MarkReadPayload,
    ctx: WorkspaceContext = Depends(get_workspace_context_incl_pending),
    db: AsyncSession = Depends(get_db),
):
    note = (
        await db.execute(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.workspace_id == ctx.workspace.id,
                Notification.receiver_id == ctx.user.id,
            )
        )
    ).scalar_one_or_none()
    if note is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")
    note.read = payload.read
    await db.commit()
    return _out(note, ctx.workspace.slug)


@router.post(f"{_W}/notifications/mark-all-read/")
async def mark_all_read(
    ctx: WorkspaceContext = Depends(get_workspace_context_incl_pending),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    await db.execute(
        update(Notification)
        .where(
            Notification.workspace_id == ctx.workspace.id,
            Notification.receiver_id == ctx.user.id,
        )
        .values(read=True)
    )
    await db.commit()
    return {"success": True}
