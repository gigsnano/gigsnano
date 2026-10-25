"""Staff CRUD for notification template copy."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.admin.audit import record_audit
from gigsnano_api.admin.deps import StaffContext, require_privilege
from gigsnano_api.core.db import get_db
from gigsnano_api.models import ENotificationKind, NotificationTemplate
from gigsnano_api.notifications.render import unknown_placeholders

router = APIRouter(prefix="/notification-templates", tags=["admin"])


class NotificationTemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    trigger_key: str
    kind: ENotificationKind
    label: str
    description: str
    title_template: str
    body_template: str
    default_title_template: str
    default_body_template: str
    variables: list[str]
    enabled: bool
    email_enabled: bool
    email_subject_template: str
    email_body_html_template: str
    updated_at: datetime


class UpdateNotificationTemplatePayload(BaseModel):
    title_template: str | None = None
    body_template: str | None = None
    enabled: bool | None = None
    email_enabled: bool | None = None
    email_subject_template: str | None = None
    email_body_html_template: str | None = None


def _out(tpl: NotificationTemplate) -> NotificationTemplateOut:
    return NotificationTemplateOut(
        trigger_key=tpl.trigger_key,
        kind=tpl.kind,
        label=tpl.label,
        description=tpl.description,
        title_template=tpl.title_template,
        body_template=tpl.body_template,
        default_title_template=tpl.default_title_template,
        default_body_template=tpl.default_body_template,
        variables=list(tpl.variables or []),
        enabled=tpl.enabled,
        email_enabled=tpl.email_enabled,
        email_subject_template=tpl.email_subject_template,
        email_body_html_template=tpl.email_body_html_template,
        updated_at=tpl.updated_at,
    )


async def _template_or_404(db: AsyncSession, trigger_key: str) -> NotificationTemplate:
    tpl = (
        await db.execute(
            select(NotificationTemplate).where(NotificationTemplate.trigger_key == trigger_key)
        )
    ).scalar_one_or_none()
    if tpl is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Template not found")
    return tpl


def _validate_templates(tpl: NotificationTemplate, payload: UpdateNotificationTemplatePayload) -> None:
    allowed = list(tpl.variables or [])
    if payload.title_template is not None:
        bad = unknown_placeholders(payload.title_template, allowed)
        if bad:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Unknown placeholder(s) in title_template: {', '.join(bad)}",
            )
    if payload.body_template is not None:
        bad = unknown_placeholders(payload.body_template, allowed)
        if bad:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Unknown placeholder(s) in body_template: {', '.join(bad)}",
            )
    if payload.email_subject_template is not None:
        bad = unknown_placeholders(payload.email_subject_template, allowed)
        if bad:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Unknown placeholder(s) in email_subject_template: {', '.join(bad)}",
            )
    if payload.email_body_html_template is not None:
        bad = unknown_placeholders(payload.email_body_html_template, allowed)
        if bad:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Unknown placeholder(s) in email_body_html_template: {', '.join(bad)}",
            )


@router.get("/", response_model=list[NotificationTemplateOut])
async def list_notification_templates(
    ctx: StaffContext = Depends(require_privilege("notifications.read")),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(select(NotificationTemplate).order_by(NotificationTemplate.trigger_key))
    ).scalars().all()
    return [_out(t) for t in rows]


@router.get("/{trigger_key}/", response_model=NotificationTemplateOut)
async def get_notification_template(
    trigger_key: str,
    ctx: StaffContext = Depends(require_privilege("notifications.read")),
    db: AsyncSession = Depends(get_db),
):
    return _out(await _template_or_404(db, trigger_key))


@router.patch("/{trigger_key}/", response_model=NotificationTemplateOut)
async def update_notification_template(
    trigger_key: str,
    payload: UpdateNotificationTemplatePayload,
    ctx: StaffContext = Depends(require_privilege("notifications.manage")),
    db: AsyncSession = Depends(get_db),
):
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No fields to update")
    tpl = await _template_or_404(db, trigger_key)
    _validate_templates(tpl, payload)
    before = {
        "title_template": tpl.title_template,
        "body_template": tpl.body_template,
        "enabled": tpl.enabled,
        "email_enabled": tpl.email_enabled,
        "email_subject_template": tpl.email_subject_template,
        "email_body_html_template": tpl.email_body_html_template,
    }
    if payload.title_template is not None:
        tpl.title_template = payload.title_template
    if payload.body_template is not None:
        tpl.body_template = payload.body_template
    if payload.enabled is not None:
        tpl.enabled = payload.enabled
    if payload.email_enabled is not None:
        tpl.email_enabled = payload.email_enabled
    if payload.email_subject_template is not None:
        tpl.email_subject_template = payload.email_subject_template
    if payload.email_body_html_template is not None:
        tpl.email_body_html_template = payload.email_body_html_template
    tpl.updated_at = datetime.now(timezone.utc)
    await record_audit(
        db,
        ctx,
        "notification_template.update",
        target_type="notification_template",
        target_id=trigger_key,
        meta={"before": before, "after": {
            "title_template": tpl.title_template,
            "body_template": tpl.body_template,
            "enabled": tpl.enabled,
            "email_enabled": tpl.email_enabled,
            "email_subject_template": tpl.email_subject_template,
            "email_body_html_template": tpl.email_body_html_template,
        }},
    )
    await db.commit()
    return _out(tpl)


@router.post("/{trigger_key}/reset/", response_model=NotificationTemplateOut)
async def reset_notification_template(
    trigger_key: str,
    ctx: StaffContext = Depends(require_privilege("notifications.manage")),
    db: AsyncSession = Depends(get_db),
):
    tpl = await _template_or_404(db, trigger_key)
    before = {
        "title_template": tpl.title_template,
        "body_template": tpl.body_template,
    }
    tpl.title_template = tpl.default_title_template
    tpl.body_template = tpl.default_body_template
    tpl.updated_at = datetime.now(timezone.utc)
    await record_audit(
        db,
        ctx,
        "notification_template.reset",
        target_type="notification_template",
        target_id=trigger_key,
        meta={"before": before, "after": {
            "title_template": tpl.title_template,
            "body_template": tpl.body_template,
        }},
    )
    await db.commit()
    return _out(tpl)
