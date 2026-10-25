"""Admin billing configuration (GIN-30).

Slice 1 — staff manual plan override: set a workspace's subscription tier
directly, with no Stripe / no payment. This unblocks upgrades regardless of the
Stripe product/price setup (Slice 2). Gated by the `billing.manage` privilege and
audit-logged like other admin mutations.
"""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.admin.audit import record_audit
from gigsnano_api.admin.deps import StaffContext, require_privilege
from gigsnano_api.billing import plan_prices as PLAN_PRICES
from gigsnano_api.billing import subscriptions as SUB
from gigsnano_api.billing.deps import get_payment_provider
from gigsnano_api.core.db import get_db
from gigsnano_api.email.deps import get_email_provider
from gigsnano_api.email.provider import EmailProvider
from gigsnano_api.features.notifications.router import notify_plan_changed
from gigsnano_api.models import EBillingInterval, EPlanTier, Workspace
from gigsnano_api.payments.provider import PaymentProvider, map_stripe_error

router = APIRouter(tags=["admin-billing"])


class SetWorkspacePlanIn(BaseModel):
    tier: EPlanTier
    interval: EBillingInterval = EBillingInterval.MONTHLY


class WorkspacePlanOut(BaseModel):
    workspace_slug: str
    tier: EPlanTier
    interval: EBillingInterval
    status: str


@router.post(
    "/billing/workspaces/{workspace_slug}/plan/", response_model=WorkspacePlanOut
)
async def set_workspace_plan(
    workspace_slug: str,
    payload: SetWorkspacePlanIn,
    background: BackgroundTasks,
    ctx: StaffContext = Depends(require_privilege("billing.manage")),
    db: AsyncSession = Depends(get_db),
    email_provider: EmailProvider = Depends(get_email_provider),
):
    """Manually set a workspace's plan (staff grant — no Stripe). Set tier=free to
    remove a paid plan."""
    ws = (
        await db.execute(select(Workspace).where(Workspace.slug == workspace_slug))
    ).scalar_one_or_none()
    if ws is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workspace not found")

    sub = await SUB.get_or_create_subscription(db, ws.id)
    before = sub.tier.value
    # Reuse the keyless-checkout apply path: sets tier/interval + active status.
    changed = await SUB.apply_immediate_upgrade(
        db, sub, payload.tier.value, payload.interval.value, provider_ref=None
    )
    if changed:  # GIN-129: email workspace admins on a staff plan change
        await notify_plan_changed(
            db, ws.id, tier_label=payload.tier.value.capitalize(),
            background=background, provider=email_provider,
        )
    await record_audit(
        db,
        ctx,
        "billing.set_workspace_plan",
        target_type="workspace",
        target_id=ws.id,
        meta={
            "before": before,
            "after": payload.tier.value,
            "interval": payload.interval.value,
        },
    )
    await db.commit()
    return WorkspacePlanOut(
        workspace_slug=ws.slug,
        tier=sub.tier,
        interval=sub.interval,
        status=sub.status.value,
    )


# ── Slice 2: Stripe product/price configuration ──────────────────────────────


class PlanPriceOut(BaseModel):
    tier: EPlanTier
    interval: EBillingInterval
    stripe_product_id: str | None
    stripe_price_id: str | None
    unit_amount_cents: int
    currency: str
    active: bool
    configured: bool  # has an active, usable Stripe price


class SetPlanPriceIn(BaseModel):
    amount_cents: int = Field(gt=0)
    currency: str = "usd"


def _price_out(tier, interval, row) -> PlanPriceOut:
    return PlanPriceOut(
        tier=tier,
        interval=interval,
        stripe_product_id=row.stripe_product_id if row else None,
        stripe_price_id=row.stripe_price_id if row else None,
        unit_amount_cents=row.unit_amount_cents if row else 0,
        currency=row.currency if row else "usd",
        active=row.active if row else False,
        configured=bool(row and row.active and row.stripe_price_id),
    )


@router.get("/billing/plans/", response_model=list[PlanPriceOut])
async def list_plan_prices(
    ctx: StaffContext = Depends(require_privilege("billing.manage")),
    db: AsyncSession = Depends(get_db),
):
    """The purchasable tier×interval combos and their configured Stripe price (if any)."""
    rows = {(r.tier, r.interval): r for r in await PLAN_PRICES.list_rows(db)}
    return [
        _price_out(tier, interval, rows.get((tier, interval)))
        for tier, interval in PLAN_PRICES.CONFIGURABLE
    ]


@router.put("/billing/plans/{tier}/{interval}/price/", response_model=PlanPriceOut)
async def set_plan_price(
    tier: EPlanTier,
    interval: EBillingInterval,
    payload: SetPlanPriceIn,
    ctx: StaffContext = Depends(require_privilege("billing.manage")),
    db: AsyncSession = Depends(get_db),
    provider: PaymentProvider = Depends(get_payment_provider),
):
    """Create (via the Stripe API) the Product + recurring Price for this combo at the
    given amount, and store the ids in the DB (the source of truth at checkout)."""
    if (tier, interval) not in PLAN_PRICES.CONFIGURABLE:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Not a purchasable tier/interval")
    existing = await PLAN_PRICES.get_row(db, tier, interval)
    try:
        product_id, price_id = await provider.ensure_stripe_price(
            tier.value,
            interval.value,
            payload.amount_cents,
            payload.currency,
            existing.stripe_product_id if existing else None,
            existing.stripe_price_id if existing else None,
        )
    except Exception as e:  # noqa: BLE001 — map Stripe SDK errors to a clean status
        http, msg = map_stripe_error(e)
        raise HTTPException(http, msg) from e

    row = await PLAN_PRICES.upsert_price(
        db, tier, interval,
        product_id=product_id, price_id=price_id,
        amount_cents=payload.amount_cents, currency=payload.currency,
    )
    await record_audit(
        db, ctx, "billing.set_plan_price",
        target_type="plan_price", target_id=f"{tier.value}_{interval.value}",
        meta={"amount_cents": payload.amount_cents, "price_id": price_id},
    )
    await db.commit()
    return _price_out(tier, interval, row)
