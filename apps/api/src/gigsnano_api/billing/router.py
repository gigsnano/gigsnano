import logging

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.admin.deps import require_privilege
from gigsnano_api.auth.deps import get_current_user
from gigsnano_api.auth.models import User
from gigsnano_api.billing import plan_prices as PLAN_PRICES
from gigsnano_api.billing import subscriptions as SUB
from gigsnano_api.billing import wallet as W
from gigsnano_api.billing.connect import get_or_create_connect, refresh_status
from gigsnano_api.billing.deps import get_payment_provider
from gigsnano_api.billing.fees import get_platform_fee_bps
from gigsnano_api.core.db import get_db
from gigsnano_api.email.deps import get_email_provider
from gigsnano_api.email.provider import EmailProvider
from gigsnano_api.features.notifications.router import (
    notify_invoice_paid,
    notify_plan_changed,
    resolve_and_notify,
    workspace_admin_user_ids,
)
from gigsnano_api.models import (
    EBillingInterval,
    ENotificationKind,
    EPlanTier,
    EWorkspaceRole,
    PlatformConfig,
    WalletTransaction,
)
from gigsnano_api.payments.provider import PaymentProvider, StripeConfigError, map_stripe_error
from gigsnano_api.shared.context import WorkspaceContext, get_workspace_context, require_role

ADMINS = (EWorkspaceRole.ADMIN, EWorkspaceRole.OWNER)
router = APIRouter(tags=["billing"])
logger = logging.getLogger("gigsnano.billing")

_FEE_PRIVILEGE = "billing.manage"


class TopupIn(BaseModel):
    amount_cents: int


class WalletOut(BaseModel):
    available_cents: int
    held_cents: int
    currency: str


class FeeIn(BaseModel):
    platform_fee_bps: int


@router.get("/workspaces/{workspace_slug}/billing/wallet/", response_model=WalletOut)
async def get_wallet(
    # Any workspace member may READ the balance — the top-bar balance pill is shown
    # to everyone, and members consume the AI credits, so a 403 here just rendered
    # $0.00 for non-admins. Spend/top-up stays admin/owner-gated below.
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    w = await W.get_or_create_wallet(db, ctx.workspace.id)
    await db.commit()
    return WalletOut(available_cents=w.available_cents, held_cents=w.held_cents,
                     currency=w.currency)


class SubscriptionOut(BaseModel):
    tier: str
    interval: str
    status: str
    seats_used: int
    current_period_end: str | None


class CheckoutIn(BaseModel):
    tier: EPlanTier
    interval: EBillingInterval


class CheckoutOut(BaseModel):
    checkout_url: str


@router.get(
    "/workspaces/{workspace_slug}/billing/subscription/", response_model=SubscriptionOut
)
async def get_subscription(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    sub = await SUB.get_or_create_subscription(db, ctx.workspace.id)
    seats = await SUB.count_active_seats(db, ctx.workspace.id)
    await db.commit()
    return SubscriptionOut(
        tier=sub.tier.value,
        interval=sub.interval.value,
        status=sub.status.value,
        seats_used=seats,
        current_period_end=sub.current_period_end.isoformat() if sub.current_period_end else None,
    )


@router.post(
    "/workspaces/{workspace_slug}/billing/checkout/", response_model=CheckoutOut
)
async def create_subscription_checkout(
    body: CheckoutIn,
    background: BackgroundTasks,
    ctx: WorkspaceContext = Depends(require_role(*ADMINS)),
    db: AsyncSession = Depends(get_db),
    provider: PaymentProvider = Depends(get_payment_provider),
    email_provider: EmailProvider = Depends(get_email_provider),
):
    sub = await SUB.get_or_create_subscription(db, ctx.workspace.id)
    # DB-configured price (admin Plans & Billing) — no stripe_price_ids env anymore.
    price_id = await PLAN_PRICES.active_price_id(db, body.tier, body.interval)
    try:
        res = await provider.create_subscription_checkout(
            body.tier.value, body.interval.value, ctx.workspace.id,
            ctx.workspace.slug, sub.stripe_customer_id, price_id,
        )
    except StripeConfigError as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e)) from e
    except Exception as e:  # noqa: BLE001 — map Stripe SDK errors to clean HTTP
        http, msg = map_stripe_error(e)
        raise HTTPException(http, msg) from e
    # Fake/keyless mode has no webhook to apply the plan — do it here (GIN-30).
    if res.immediate:
        changed = await SUB.apply_immediate_upgrade(
            db, sub, body.tier.value, body.interval.value, res.provider_ref
        )
        if changed:  # GIN-129: email admins on upgrade/downgrade (fake path has no webhook)
            await notify_plan_changed(
                db, ctx.workspace.id, tier_label=body.tier.value.capitalize(),
                background=background, provider=email_provider, triggered_by_id=ctx.user.id,
            )
    await db.commit()
    return CheckoutOut(checkout_url=res.checkout_url)


@router.post(
    "/workspaces/{workspace_slug}/billing/portal/", response_model=CheckoutOut
)
async def create_billing_portal(
    ctx: WorkspaceContext = Depends(require_role(*ADMINS)),
    db: AsyncSession = Depends(get_db),
    provider: PaymentProvider = Depends(get_payment_provider),
):
    sub = await SUB.get_or_create_subscription(db, ctx.workspace.id)
    try:
        url = await provider.create_billing_portal(sub.stripe_customer_id, ctx.workspace.slug)
    except StripeConfigError as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e)) from e
    except Exception as e:  # noqa: BLE001
        http, msg = map_stripe_error(e)
        raise HTTPException(http, msg) from e
    await db.commit()
    return CheckoutOut(checkout_url=url)


@router.post("/workspaces/{workspace_slug}/billing/topup/")
async def topup(
    payload: TopupIn,
    background: BackgroundTasks,
    ctx: WorkspaceContext = Depends(require_role(*ADMINS)),
    db: AsyncSession = Depends(get_db),
    provider: PaymentProvider = Depends(get_payment_provider),
    email_provider: EmailProvider = Depends(get_email_provider),
):
    if payload.amount_cents <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "amount must be positive")
    try:
        result = await provider.create_topup(
            payload.amount_cents, ctx.workspace.id, ctx.workspace.slug,
        )
    except Exception as err:  # noqa: BLE001 — map Stripe errors to a clean status
        from gigsnano_api.payments.provider import map_stripe_error
        code, msg = map_stripe_error(err)
        raise HTTPException(code, msg)

    credited = False
    if result.immediate:
        seen = (await db.execute(
            select(WalletTransaction).where(WalletTransaction.stripe_ref == result.provider_ref)
        )).scalar_one_or_none()
        if seen is None:
            await W.credit(db, ctx.workspace.id, payload.amount_cents,
                           ref_type="topup", stripe_ref=result.provider_ref)
            credited = True
        await db.commit()
    if credited:
        amount = f"${payload.amount_cents / 100:.2f}"
        href = f"/{ctx.workspace.slug}/settings/billing"
        for admin_id in await workspace_admin_user_ids(db, ctx.workspace.id):
            await resolve_and_notify(
                db,
                ctx.workspace.id,
                admin_id,
                trigger_key="billing.topup_receipt",
                context={"workspace": ctx.workspace.name, "amount": amount},
                kind=ENotificationKind.SYSTEM,
                href=href,
                triggered_by_id=ctx.user.id,
                require_project_member=False,
                transactional=True,  # GIN-129: a receipt must ignore the digest opt-out
                background=background,
                provider=email_provider,
            )
        await db.commit()
    return {"checkout_url": result.checkout_url, "provider_ref": result.provider_ref}


@router.get("/workspaces/{workspace_slug}/billing/transactions/")
async def list_transactions(
    ctx: WorkspaceContext = Depends(require_role(*ADMINS)),
    db: AsyncSession = Depends(get_db),
):
    w = await W.get_or_create_wallet(db, ctx.workspace.id)
    rows = (await db.execute(
        select(WalletTransaction)
        .where(WalletTransaction.wallet_id == w.id)
        .order_by(WalletTransaction.created_at.desc())
    )).scalars().all()
    return [
        {"id": t.id, "type": t.type.value, "amount_cents": t.amount_cents,
         "available_after": t.available_after, "held_after": t.held_after,
         "ref_type": t.ref_type, "created_at": t.created_at.isoformat()}
        for t in rows
    ]


@router.post("/billing/webhook/")
async def stripe_webhook(
    request: Request,
    background: BackgroundTasks,
    stripe_signature: str = Header(default=""),
    db: AsyncSession = Depends(get_db),
    provider: PaymentProvider = Depends(get_payment_provider),
    email_provider: EmailProvider = Depends(get_email_provider),
):
    body = await request.body()
    try:
        event = provider.verify_webhook(body, stripe_signature)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid signature")
    event_type = event.get("type")
    if event_type == "checkout.session.completed":
        obj = event["data"]["object"]
        kind = obj.get("metadata", {}).get("kind")
        if kind == "wallet_topup":
            session_id = obj["id"]
            seen = (await db.execute(
                select(WalletTransaction).where(WalletTransaction.stripe_ref == session_id)
            )).scalar_one_or_none()
            if seen is None:
                await W.credit(db, obj["metadata"]["workspace_id"], obj["amount_total"],
                               ref_type="topup", stripe_ref=session_id)
                await db.commit()
                logger.info("wallet credited via webhook session=%s amount=%s ws=%s",
                            session_id, obj["amount_total"], obj["metadata"]["workspace_id"])
            else:
                logger.info("webhook duplicate ignored session=%s", session_id)
        elif kind == "subscription":
            sub, changed = await SUB.apply_checkout_completed(db, obj)
            if changed and sub is not None:  # GIN-129
                await notify_plan_changed(db, sub.workspace_id,
                                          tier_label=sub.tier.value.capitalize(),
                                          background=background, provider=email_provider)
            await db.commit()
            logger.info("subscription checkout completed ws=%s sub=%s",
                        obj.get("metadata", {}).get("workspace_id"), obj.get("subscription"))
        else:
            logger.info("webhook ignored: unknown kind metadata=%s", obj.get("metadata"))
    elif event_type in ("customer.subscription.created", "customer.subscription.updated"):
        sub, changed = await SUB.apply_subscription_synced(db, event["data"]["object"])
        if changed and sub is not None:  # GIN-129: only email when the tier actually changed
            await notify_plan_changed(db, sub.workspace_id,
                                      tier_label=sub.tier.value.capitalize(),
                                      background=background, provider=email_provider)
        await db.commit()
        logger.info("subscription synced type=%s sub=%s", event_type, event["data"]["object"].get("id"))
    elif event_type == "customer.subscription.deleted":
        sub, changed = await SUB.apply_subscription_synced(db, event["data"]["object"], deleted=True)
        if changed and sub is not None:  # GIN-129
            await notify_plan_changed(db, sub.workspace_id,
                                      tier_label=sub.tier.value.capitalize(),
                                      background=background, provider=email_provider)
        await db.commit()
        logger.info("subscription canceled sub=%s", event["data"]["object"].get("id"))
    elif event_type == "invoice.payment_succeeded":
        # GIN-129: email a copy of the invoice on each subscription payment
        # (recurring monthly receipt). Sent even for $0 invoices (free renewals /
        # 100%-off coupons still get a copy). Only non-subscription invoices skip.
        obj = event["data"]["object"]
        amount_cents = obj.get("amount_paid") or 0
        reason = obj.get("billing_reason")
        if obj.get("subscription") and reason in (
            "subscription_create", "subscription_cycle", "subscription_update",
        ):
            sub = await SUB.find_by_stripe(db, obj.get("subscription"), obj.get("customer"))
            if sub is not None:
                await notify_invoice_paid(
                    db, sub.workspace_id,
                    amount=f"${amount_cents / 100:.2f}",
                    invoice_url=obj.get("hosted_invoice_url") or obj.get("invoice_pdf"),
                    background=background, provider=email_provider,
                )
                await db.commit()
        logger.info("invoice paid sub=%s reason=%s amount=%s",
                    obj.get("subscription"), reason, amount_cents)
    else:
        logger.info("webhook ignored: type=%s", event_type)
    return {"received": True}


@router.post("/billing/connect/onboard/")
async def connect_onboard(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    provider: PaymentProvider = Depends(get_payment_provider),
):
    acct = await get_or_create_connect(db, provider, user.id)
    url = await provider.onboarding_link(acct.stripe_account_id)
    await db.commit()
    return {"url": url}


@router.get("/billing/connect/status/")
async def connect_status(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    provider: PaymentProvider = Depends(get_payment_provider),
):
    acct = await get_or_create_connect(db, provider, user.id)
    acct = await refresh_status(db, provider, acct)
    await db.commit()
    return {"status": acct.status.value, "payouts_enabled": acct.payouts_enabled}


@router.get("/admin/billing/platform-fee/",
            dependencies=[Depends(require_privilege(_FEE_PRIVILEGE))])
async def get_fee(db: AsyncSession = Depends(get_db)):
    bps = await get_platform_fee_bps(db)
    await db.commit()
    return {"platform_fee_bps": bps}


@router.put("/admin/billing/platform-fee/",
            dependencies=[Depends(require_privilege(_FEE_PRIVILEGE))])
async def set_fee(payload: FeeIn, db: AsyncSession = Depends(get_db)):
    if not (0 <= payload.platform_fee_bps <= 10000):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "fee must be 0..10000 bps")
    await get_platform_fee_bps(db)  # ensure the singleton exists
    row = await db.get(PlatformConfig, "platform")
    row.platform_fee_bps = payload.platform_fee_bps
    await db.commit()
    return {"platform_fee_bps": row.platform_fee_bps}
