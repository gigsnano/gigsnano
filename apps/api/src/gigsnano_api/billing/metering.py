"""Metering + per-plan quota enforcement (GIN-235). `meter(db, ws, key)` records a
metered action and, if the plan's monthly quota is exceeded, debits the wallet for
the overage (graceful) or 402s if the wallet is empty (block). Within quota, it just
records. Reuses the subscription (plan) + wallet seams; no new balance concept."""

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.billing import wallet as _wallet
from gigsnano_api.billing.entitlements import ENTITLEMENTS, OVERAGE_CENTS, check_entitlement
from gigsnano_api.billing.subscriptions import get_or_create_subscription
from gigsnano_api.core.db import utcnow
from gigsnano_api.models.metering import MeteringEvent


def _month_start(now):
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


async def usage_this_month(db: AsyncSession, workspace_id: str, key: str, now=None) -> int:
    start = _month_start(now or utcnow())
    return int(await db.scalar(
        select(func.count()).select_from(MeteringEvent).where(
            MeteringEvent.workspace_id == workspace_id,
            MeteringEvent.key == key,
            MeteringEvent.created_at >= start,
        )
    ) or 0)


async def meter(db: AsyncSession, workspace_id: str, key: str) -> None:
    """Record one metered action; enforce the plan's monthly quota with wallet overage."""
    quotas = ENTITLEMENTS.get(key, (None, {}))[1]
    event = MeteringEvent(workspace_id=workspace_id, key=key)
    db.add(event)
    await db.flush()
    if not quotas:
        return  # not a metered entitlement — just an audit row
    sub = await get_or_create_subscription(db, workspace_id)
    quota = quotas.get(sub.tier)
    if quota is None:
        return  # unlimited on this tier
    if await usage_this_month(db, workspace_id, key) > quota:
        cents = OVERAGE_CENTS.get(key, 0)
        if cents <= 0:
            raise HTTPException(
                status.HTTP_402_PAYMENT_REQUIRED, f"Monthly '{key}' quota reached — upgrade to continue."
            )
        try:
            await _wallet.debit(db, workspace_id, cents, ref_type=f"meter:{key}", ref_id=event.id)
        except _wallet.InsufficientBalance:
            raise HTTPException(
                status.HTTP_402_PAYMENT_REQUIRED,
                f"'{key}' quota exceeded and wallet is empty — top up or upgrade.",
            ) from None


async def entitlement_summary(db: AsyncSession, workspace_id: str) -> list[dict]:
    """Per-key {available, metered, quota, used} for the gating UX (GIN-236)."""
    sub = await get_or_create_subscription(db, workspace_id)
    now = utcnow()
    out = []
    for key, (_min_tier, quotas) in ENTITLEMENTS.items():
        metered = bool(quotas)
        out.append({
            "key": key,
            "available": check_entitlement(sub.tier, key),
            "metered": metered,
            "quota": quotas.get(sub.tier) if metered else None,
            "used": await usage_this_month(db, workspace_id, key, now) if metered else 0,
        })
    return out
