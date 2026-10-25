from __future__ import annotations

from fastapi import BackgroundTasks
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.features.notifications.router import sprint_zero_complete
from gigsnano_api.models import SlackConnection, Webhook, WebhookDelivery
from gigsnano_api.webhooks.sender import WebhookSender
from gigsnano_api.webhooks.slack_sender import SlackSender, build_default_slack_sender

WEBHOOK_EVENTS: frozenset[str] = frozenset(
    {"story.created", "story.updated", "story.assigned", "sprint.completed"}
)


async def webhooks_subscribed_to(
    db: AsyncSession, workspace_id: str, event: str
) -> list[Webhook]:
    """Enabled webhooks in the workspace whose events[] contains `event`."""
    rows = (
        await db.execute(
            select(Webhook).where(
                Webhook.workspace_id == workspace_id, Webhook.enabled.is_(True)
            )
        )
    ).scalars().all()
    return [w for w in rows if event in (w.events or [])]


async def deliver(
    db: AsyncSession, sender: WebhookSender, webhook: Webhook, event: str, payload: dict
) -> WebhookDelivery:
    """Call the sender and record ONE delivery row. No commit — the caller commits."""
    result = await sender.send(
        url=webhook.url, event=event, payload=payload, secret=webhook.secret
    )
    delivery = WebhookDelivery(
        webhook_id=webhook.id, event=event,
        status=result.status, response_code=result.response_code,
    )
    db.add(delivery)
    await db.flush()
    return delivery


async def _deliver_in_fresh_session(
    sender: WebhookSender, webhook_id: str, event: str, payload: dict
) -> None:
    """Background task: the request session is closed — open our own (sync precedent)."""
    from gigsnano_api.core.db import async_session

    async with async_session() as db:
        webhook = await db.get(Webhook, webhook_id)
        if webhook is None:
            return
        await deliver(db, sender, webhook, event, payload)
        await db.commit()


async def _slack_connection_for(
    db: AsyncSession, workspace_id: str
) -> SlackConnection | None:
    return (
        await db.execute(
            select(SlackConnection).where(SlackConnection.workspace_id == workspace_id)
        )
    ).scalar_one_or_none()


async def _deliver_slack_in_fresh_session(
    sender: SlackSender, connection_id: str, text: str
) -> None:
    """Background task: the request session is closed — open our own (sync precedent)."""
    from gigsnano_api.core.db import async_session
    from gigsnano_api.sync.token_crypto import decrypt_token

    async with async_session() as db:
        conn = await db.get(SlackConnection, connection_id)
        if conn is None or not conn.default_channel_id:
            return
        await sender.send(
            token=decrypt_token(conn.access_token_encrypted),
            channel_id=conn.default_channel_id,
            text=text,
        )


async def dispatch_to_slack(
    db: AsyncSession,
    workspace_id: str,
    workspace_slug: str,
    event: str,
    data: dict,
    *,
    background: BackgroundTasks,
    slack_sender: SlackSender,
) -> None:
    """Post `event` to the workspace's connected Slack channel, if any and if
    subscribed — same 4-event WEBHOOK_EVENTS catalog, no second event catalog.

    Best-effort: Slack lookup/send must never fail the originating write
    (story create/update). Missing tables or DB errors are logged and skipped.
    """
    try:
        conn = await _slack_connection_for(db, workspace_id)
    except Exception:
        # e.g. slack_connections migration not applied yet — don't 500 the write.
        return
    if conn is None or not conn.default_channel_id or event not in (conn.notify_events or []):
        return
    label = data.get("title") or data.get("project_id") or ""
    text = f"[{workspace_slug}] {event}" + (f" — {label}" if label else "")
    background.add_task(_deliver_slack_in_fresh_session, slack_sender, conn.id, text)


async def dispatch_event(
    db: AsyncSession,
    workspace_id: str,
    workspace_slug: str,
    event: str,
    data: dict,
    *,
    background: BackgroundTasks,
    sender: WebhookSender,
    slack_sender: SlackSender | None = None,
) -> None:
    """Enqueue a delivery for each enabled webhook subscribed to `event`, plus a
    Slack post if the workspace has a connected channel subscribed to `event`.

    No delivery/commit here — like notify(), this only participates in the request
    and hands the actual send off to a background task with its own session.
    """
    hooks = await webhooks_subscribed_to(db, workspace_id, event)
    envelope = {"event": event, "workspace": workspace_slug, "data": data}
    for wh in hooks:
        background.add_task(_deliver_in_fresh_session, sender, wh.id, event, envelope)
    await dispatch_to_slack(
        db, workspace_id, workspace_slug, event, data,
        background=background, slack_sender=slack_sender or build_default_slack_sender(),
    )


async def dispatch_sprint_completed_if_transitioned(
    db: AsyncSession,
    project,
    workspace_slug: str,
    was_s0_complete: bool,
    *,
    background: BackgroundTasks,
    sender: WebhookSender,
) -> None:
    """Fire sprint.completed once, on the false→true Sprint-0 transition."""
    if not was_s0_complete and await sprint_zero_complete(db, project.id):
        await dispatch_event(
            db, project.workspace_id, workspace_slug, "sprint.completed",
            {"project_id": project.id}, background=background, sender=sender,
        )
