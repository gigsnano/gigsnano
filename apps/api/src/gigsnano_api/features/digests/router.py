"""Digest endpoints (GIN-103): on-demand preview, admin/cron run trigger, the
delivery log, and unauthenticated open/click tracking for email metrics."""

import base64

from fastapi import APIRouter, BackgroundTasks, Depends, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.bmad.provider import LLMProvider, get_llm_provider
from gigsnano_api.core.config import settings
from gigsnano_api.core.db import get_db, utcnow
from gigsnano_api.email.deps import get_email_provider
from gigsnano_api.email.provider import EmailProvider
from gigsnano_api.features.digests.ai import generate_digest_summary
from gigsnano_api.features.digests.schemas import (
    DigestDeliveryOut,
    DigestOut,
    DigestPreferenceOut,
    DigestPreferenceUpdate,
    DigestRunResultOut,
)
from gigsnano_api.features.digests.service import (
    build_digest,
    effective_statuses,
    effective_template,
    load_preference,
    run_workspace_digests,
    serialize_delivery,
    serialize_preference,
    suggest_template_for_role,
)
from gigsnano_api.models import DigestDelivery, DigestPreference, EWorkspaceRole
from gigsnano_api.shared.context import WorkspaceContext, get_workspace_context, require_role

router = APIRouter(tags=["digests"])

# 1x1 transparent GIF for the open-tracking pixel.
_PIXEL = base64.b64decode(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
)


@router.get("/workspaces/{workspace_slug}/digests/me/", response_model=DigestOut)
async def preview_my_digest(
    ai: bool = False,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
    llm: LLMProvider = Depends(get_llm_provider),
):
    """The current user's digest computed live (no send, no delivery record).
    `?ai=true` also generates the AI focus note (GIN-101). Honors the user's
    status filter + role-based template (GIN-100/102)."""
    pref = await load_preference(db, ctx.user.id)
    digest = await build_digest(
        db,
        ctx.workspace,
        ctx.user,
        statuses=effective_statuses(pref),
        template=effective_template(pref, ctx.role),
    )
    if ai:
        # Preview only — no delivery row, and deliberately not recorded: it's a live
        # recompute the user can hit repeatedly, and billing a preview would charge
        # for looking. The scheduled send is what gets recorded (GIN-147).
        digest.ai_summary = (await generate_digest_summary(llm, digest)).note
    return digest


@router.get(
    "/workspaces/{workspace_slug}/digests/preferences/", response_model=DigestPreferenceOut
)
async def get_preferences(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    """The current user's digest preferences (GIN-100). Absent row ⇒ defaults, with
    the template auto-selected from the caller's workspace role (GIN-102)."""
    pref = await load_preference(db, ctx.user.id)
    out = serialize_preference(pref)
    if pref is None:
        out.template = suggest_template_for_role(ctx.role)
    return out


@router.put(
    "/workspaces/{workspace_slug}/digests/preferences/", response_model=DigestPreferenceOut
)
async def update_preferences(
    payload: DigestPreferenceUpdate,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    pref = await load_preference(db, ctx.user.id)
    if pref is None:
        pref = DigestPreference(user_id=ctx.user.id)
        db.add(pref)
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        if field == "statuses" and value is not None:
            value = [s.value for s in payload.statuses]
        elif field == "template" and value is not None:
            value = payload.template.value
        setattr(pref, field, value)
    await db.commit()
    await db.refresh(pref)
    return serialize_preference(pref)


@router.post(
    "/workspaces/{workspace_slug}/digests/run/", response_model=DigestRunResultOut
)
async def run_digests(
    background: BackgroundTasks,
    ctx: WorkspaceContext = Depends(require_role(EWorkspaceRole.ADMIN, EWorkspaceRole.OWNER)),
    db: AsyncSession = Depends(get_db),
    provider: EmailProvider = Depends(get_email_provider),
    llm: LLMProvider = Depends(get_llm_provider),
):
    """Run the workspace's daily digest now (manual / external-cron trigger).
    Idempotent — users already delivered today are skipped."""
    return await run_workspace_digests(
        db, ctx.workspace, provider=provider, llm_provider=llm, background=background
    )


@router.get(
    "/workspaces/{workspace_slug}/digests/deliveries/",
    response_model=list[DigestDeliveryOut],
)
async def list_deliveries(
    limit: int = 100,
    ctx: WorkspaceContext = Depends(require_role(EWorkspaceRole.ADMIN, EWorkspaceRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    """Delivery log + engagement metrics (open/click) for the workspace."""
    rows = (
        await db.execute(
            select(DigestDelivery)
            .where(DigestDelivery.workspace_id == ctx.workspace.id)
            .order_by(DigestDelivery.created_at.desc())
            .limit(max(1, min(limit, 500)))
        )
    ).scalars().all()
    return [serialize_delivery(d) for d in rows]


@router.get("/digests/track/open/{delivery_id}/")
async def track_open(delivery_id: str, db: AsyncSession = Depends(get_db)):
    """Email open pixel — unauthenticated (the delivery UUID is the capability)."""
    delivery = await db.get(DigestDelivery, delivery_id)
    if delivery is not None and delivery.opened_at is None:
        delivery.opened_at = utcnow()
        await db.commit()
    return Response(
        content=_PIXEL,
        media_type="image/gif",
        headers={"Cache-Control": "no-store", "Content-Length": str(len(_PIXEL))},
    )


@router.get("/digests/track/click/{delivery_id}/")
async def track_click(delivery_id: str, to: str = "", db: AsyncSession = Depends(get_db)):
    """Tracked click — records first click, then redirects. Only redirects to an
    app/frontend URL (no open-redirect)."""
    delivery = await db.get(DigestDelivery, delivery_id)
    if delivery is not None and delivery.clicked_at is None:
        delivery.clicked_at = utcnow()
        await db.commit()
    allowed = (settings.app_base_url, settings.frontend_url)
    target = to if to and any(to.startswith(a) for a in allowed if a) else settings.app_base_url
    return RedirectResponse(target, status_code=status.HTTP_302_FOUND)
