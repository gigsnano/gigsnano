"""DB-backed subscription price config (GIN-30 Slice 2).

`plan_prices` is the single source of truth for which Stripe price a purchasable
(tier, interval) maps to — configured from the admin Plans & Billing page. There
is no `stripe_price_ids` env anymore. Free has no price.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.models import EBillingInterval, EPlanTier, PlanPrice

# The purchasable combinations shown/configured in admin (Free has no price).
CONFIGURABLE: list[tuple[EPlanTier, EBillingInterval]] = [
    (EPlanTier.PRO, EBillingInterval.MONTHLY),
    (EPlanTier.PRO, EBillingInterval.ANNUAL),
    (EPlanTier.BUSINESS, EBillingInterval.MONTHLY),
    (EPlanTier.BUSINESS, EBillingInterval.ANNUAL),
]


async def get_row(
    db: AsyncSession, tier: EPlanTier, interval: EBillingInterval
) -> PlanPrice | None:
    return (
        await db.execute(
            select(PlanPrice).where(
                PlanPrice.tier == tier, PlanPrice.interval == interval
            )
        )
    ).scalar_one_or_none()


async def active_price_id(
    db: AsyncSession, tier: EPlanTier, interval: EBillingInterval
) -> str | None:
    """The Stripe price id to charge at checkout, or None if not configured."""
    row = await get_row(db, tier, interval)
    if row and row.active and row.stripe_price_id:
        return row.stripe_price_id
    return None


async def list_rows(db: AsyncSession) -> list[PlanPrice]:
    return list((await db.execute(select(PlanPrice))).scalars().all())


async def upsert_price(
    db: AsyncSession,
    tier: EPlanTier,
    interval: EBillingInterval,
    *,
    product_id: str,
    price_id: str,
    amount_cents: int,
    currency: str,
) -> PlanPrice:
    row = await get_row(db, tier, interval)
    if row is None:
        row = PlanPrice(tier=tier, interval=interval)
        db.add(row)
    row.stripe_product_id = product_id
    row.stripe_price_id = price_id
    row.unit_amount_cents = amount_cents
    row.currency = currency
    row.active = True
    await db.flush()
    return row
