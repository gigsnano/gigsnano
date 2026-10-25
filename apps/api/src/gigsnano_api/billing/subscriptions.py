"""Subscription domain: read/seed a workspace's plan tier and sync it from
Stripe webhook events. Stripe wiring rides the shared payment-provider seam
(Fake in keyless dev). A workspace with no row is treated as Free until it
upgrades; Stripe is the source of truth once a subscription exists."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.models import (
    EBillingInterval,
    EMemberStatus,
    EPlanTier,
    ESubscriptionStatus,
    Subscription,
    WorkspaceMember,
)

_TIER_VALUES = {t.value for t in EPlanTier}
_INTERVAL_VALUES = {i.value for i in EBillingInterval}
# Stripe subscription.status → our status
_STATUS_MAP = {
    "active": ESubscriptionStatus.ACTIVE,
    "trialing": ESubscriptionStatus.ACTIVE,
    "past_due": ESubscriptionStatus.PAST_DUE,
    "unpaid": ESubscriptionStatus.PAST_DUE,
    "canceled": ESubscriptionStatus.CANCELED,
    "incomplete_expired": ESubscriptionStatus.CANCELED,
}


async def get_or_create_subscription(db: AsyncSession, workspace_id: str) -> Subscription:
    """The workspace's subscription, creating a Free default the first time."""
    sub = (
        await db.execute(select(Subscription).where(Subscription.workspace_id == workspace_id))
    ).scalar_one_or_none()
    if sub is None:
        sub = Subscription(
            workspace_id=workspace_id,
            tier=EPlanTier.FREE,
            interval=EBillingInterval.MONTHLY,
            status=ESubscriptionStatus.ACTIVE,
        )
        db.add(sub)
        await db.flush()
    return sub


async def count_active_seats(db: AsyncSession, workspace_id: str) -> int:
    """Active members occupying a seat."""
    n = (
        await db.execute(
            select(func.count())
            .select_from(WorkspaceMember)
            .where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.status == EMemberStatus.ACTIVE,
            )
        )
    ).scalar_one()
    return int(n or 0)


async def _find_by_stripe(db: AsyncSession, sub_id: str | None, customer_id: str | None) -> Subscription | None:
    if sub_id:
        row = (
            await db.execute(
                select(Subscription).where(Subscription.stripe_subscription_id == sub_id)
            )
        ).scalar_one_or_none()
        if row:
            return row
    if customer_id:
        return (
            await db.execute(
                select(Subscription).where(Subscription.stripe_customer_id == customer_id)
            )
        ).scalar_one_or_none()
    return None


async def find_by_stripe(
    db: AsyncSession, sub_id: str | None, customer_id: str | None
) -> Subscription | None:
    """Public lookup by Stripe subscription/customer id (webhook use)."""
    return await _find_by_stripe(db, sub_id, customer_id)


async def apply_checkout_completed(
    db: AsyncSession, session_obj: dict
) -> tuple[Subscription | None, bool]:
    """`checkout.session.completed` (subscription mode): attach Stripe ids + tier
    to the workspace's row. This is the authoritative event that sets the
    customer id (which the billing portal needs). Returns (sub, tier_changed)."""
    md = session_obj.get("metadata") or {}
    ws_id = md.get("workspace_id")
    if not ws_id:
        return None, False
    sub = await get_or_create_subscription(db, ws_id)
    old_tier = sub.tier
    if session_obj.get("customer"):
        sub.stripe_customer_id = session_obj["customer"]
    if session_obj.get("subscription"):
        sub.stripe_subscription_id = session_obj["subscription"]
    tier = md.get("tier")
    if tier in _TIER_VALUES:
        sub.tier = EPlanTier(tier)
    sub.status = ESubscriptionStatus.ACTIVE
    await db.flush()
    return sub, sub.tier != old_tier


async def apply_immediate_upgrade(
    db: AsyncSession, sub: Subscription, tier: str, interval: str, provider_ref: str | None
) -> bool:
    """Keyless/fake checkout: apply the plan change NOW, because no Stripe webhook
    will fire (mirrors the fake top-up's `immediate` credit). Without this, a fake
    checkout redirects back but the tier never changes (GIN-30). Returns whether the
    tier changed."""
    old_tier = sub.tier
    if tier in _TIER_VALUES:
        sub.tier = EPlanTier(tier)
    if interval in _INTERVAL_VALUES:
        sub.interval = EBillingInterval(interval)
    sub.status = ESubscriptionStatus.ACTIVE
    if provider_ref:
        sub.stripe_subscription_id = provider_ref
    # A plausible renewal date so the UI's "renews {date}" reads sensibly in dev.
    days = 365 if interval == EBillingInterval.ANNUAL.value else 30
    sub.current_period_end = datetime.now(timezone.utc) + timedelta(days=days)
    await db.flush()
    return sub.tier != old_tier


async def apply_subscription_synced(
    db: AsyncSession, sub_obj: dict, *, deleted: bool = False
) -> tuple[Subscription | None, bool]:
    """`customer.subscription.created|updated|deleted`: sync status, tier,
    interval, and period end. Tier/interval come from the price's metadata
    (set by the seeder). Deletion downgrades to Free. Returns (sub, tier_changed)."""
    sub = await _find_by_stripe(db, sub_obj.get("id"), sub_obj.get("customer"))
    if sub is None:
        return None, False  # not ours yet (e.g. event arrived before checkout completed)
    old_tier = sub.tier

    if deleted:
        sub.status = ESubscriptionStatus.CANCELED
        sub.tier = EPlanTier.FREE
        sub.current_period_end = None
        await db.flush()
        return sub, sub.tier != old_tier

    sub.status = _STATUS_MAP.get(sub_obj.get("status"), sub.status)
    if not sub.stripe_subscription_id and sub_obj.get("id"):
        sub.stripe_subscription_id = sub_obj["id"]

    items = (sub_obj.get("items") or {}).get("data") or []
    if items:
        md = (items[0].get("price") or {}).get("metadata") or {}
        if md.get("gigsnano_tier") in _TIER_VALUES:
            sub.tier = EPlanTier(md["gigsnano_tier"])
        if md.get("gigsnano_interval") in _INTERVAL_VALUES:
            sub.interval = EBillingInterval(md["gigsnano_interval"])

    cpe = sub_obj.get("current_period_end")
    if cpe:
        sub.current_period_end = datetime.fromtimestamp(int(cpe), tz=timezone.utc)
    await db.flush()
    return sub, sub.tier != old_tier
