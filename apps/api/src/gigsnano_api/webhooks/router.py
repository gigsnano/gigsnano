import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import get_db
from gigsnano_api.models import EWorkspaceRole, Webhook, WebhookDelivery
from gigsnano_api.shared.context import WorkspaceContext, require_role
from gigsnano_api.webhooks.events import WEBHOOK_EVENTS, deliver
from gigsnano_api.webhooks.sender import WebhookSender, get_webhook_sender

router = APIRouter(tags=["webhooks"])
_W = "/workspaces/{workspace_slug}"
ADMINS = (EWorkspaceRole.ADMIN, EWorkspaceRole.OWNER)


class WebhookDeliveryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    status: str
    response_code: int
    created_at: datetime


class WebhookOut(BaseModel):
    id: str
    workspace_slug: str
    url: str
    events: list[str]
    secret_preview: str
    enabled: bool
    last_delivery: WebhookDeliveryOut | None
    created_at: datetime
    updated_at: datetime


class CreateWebhookPayload(BaseModel):
    url: str
    events: list[str] = []


class UpdateWebhookPayload(BaseModel):
    url: str | None = None
    events: list[str] | None = None
    enabled: bool | None = None


def _validate_events(events: list[str]) -> None:
    unknown = [e for e in events if e not in WEBHOOK_EVENTS]
    if unknown:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown event(s): {', '.join(unknown)}"
        )


async def _latest_delivery(db: AsyncSession, webhook_id: str) -> WebhookDelivery | None:
    return (
        await db.execute(
            select(WebhookDelivery)
            .where(WebhookDelivery.webhook_id == webhook_id)
            .order_by(WebhookDelivery.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def _serialize(db: AsyncSession, wh: Webhook, slug: str) -> WebhookOut:
    latest = await _latest_delivery(db, wh.id)
    return WebhookOut(
        id=wh.id,
        workspace_slug=slug,
        url=wh.url,
        events=list(wh.events or []),
        secret_preview=f"whsec_••••••••{wh.secret[-4:]}",
        enabled=wh.enabled,
        last_delivery=WebhookDeliveryOut.model_validate(latest) if latest else None,
        created_at=wh.created_at,
        updated_at=wh.updated_at,
    )


async def _webhook_or_404(
    db: AsyncSession, ctx: WorkspaceContext, webhook_id: str
) -> Webhook:
    wh = await db.get(Webhook, webhook_id)
    if wh is None or wh.workspace_id != ctx.workspace.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Webhook not found")
    return wh


@router.get(f"{_W}/webhooks/", response_model=list[WebhookOut])
async def list_webhooks(
    ctx: WorkspaceContext = Depends(require_role(*ADMINS)),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            select(Webhook)
            .where(Webhook.workspace_id == ctx.workspace.id)
            .order_by(Webhook.created_at.desc())
        )
    ).scalars().all()
    return [await _serialize(db, wh, ctx.workspace.slug) for wh in rows]


@router.post(f"{_W}/webhooks/", response_model=WebhookOut, status_code=status.HTTP_201_CREATED)
async def create_webhook(
    payload: CreateWebhookPayload,
    ctx: WorkspaceContext = Depends(require_role(*ADMINS)),
    db: AsyncSession = Depends(get_db),
):
    if not payload.url.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "URL is required")
    events = payload.events or ["story.created"]
    _validate_events(events)
    wh = Webhook(
        workspace_id=ctx.workspace.id,
        url=payload.url.strip(),
        events=events,
        secret="whsec_" + secrets.token_hex(20),
    )
    db.add(wh)
    await db.commit()
    return await _serialize(db, wh, ctx.workspace.slug)


@router.get(f"{_W}/webhooks/{{webhook_id}}/", response_model=WebhookOut)
async def get_webhook(
    webhook_id: str,
    ctx: WorkspaceContext = Depends(require_role(*ADMINS)),
    db: AsyncSession = Depends(get_db),
):
    wh = await _webhook_or_404(db, ctx, webhook_id)
    return await _serialize(db, wh, ctx.workspace.slug)


@router.patch(f"{_W}/webhooks/{{webhook_id}}/", response_model=WebhookOut)
async def update_webhook(
    webhook_id: str,
    payload: UpdateWebhookPayload,
    ctx: WorkspaceContext = Depends(require_role(*ADMINS)),
    db: AsyncSession = Depends(get_db),
):
    wh = await _webhook_or_404(db, ctx, webhook_id)
    if payload.url is not None:
        if not payload.url.strip():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "URL is required")
        wh.url = payload.url.strip()
    if payload.events is not None:
        _validate_events(payload.events)
        wh.events = payload.events
    if payload.enabled is not None:
        wh.enabled = payload.enabled
    await db.commit()
    return await _serialize(db, wh, ctx.workspace.slug)


@router.delete(f"{_W}/webhooks/{{webhook_id}}/", status_code=status.HTTP_204_NO_CONTENT)
async def delete_webhook(
    webhook_id: str,
    ctx: WorkspaceContext = Depends(require_role(*ADMINS)),
    db: AsyncSession = Depends(get_db),
):
    wh = await _webhook_or_404(db, ctx, webhook_id)
    await db.delete(wh)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(f"{_W}/webhooks/{{webhook_id}}/test/", response_model=WebhookDeliveryOut)
async def test_webhook(
    webhook_id: str,
    ctx: WorkspaceContext = Depends(require_role(*ADMINS)),
    db: AsyncSession = Depends(get_db),
    sender: WebhookSender = Depends(get_webhook_sender),
):
    wh = await _webhook_or_404(db, ctx, webhook_id)
    envelope = {
        "event": "webhook.test", "workspace": ctx.workspace.slug,
        "data": {"webhook_id": wh.id},
    }
    delivery = await deliver(db, sender, wh, "webhook.test", envelope)
    await db.commit()
    return WebhookDeliveryOut.model_validate(delivery)
