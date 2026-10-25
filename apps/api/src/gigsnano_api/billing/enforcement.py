from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.billing import wallet as W
from gigsnano_api.core.config import settings


async def ensure_positive_balance(db: AsyncSession, workspace_id: str) -> None:
    """Block AI when the workspace has no spendable (available) balance.
    Held funds don't count — that's the 'escrow locks AI' behavior.
    No-op when billing is disabled (self-hosted)."""
    if not settings.billing_enabled:
        return
    w = await W.get_or_create_wallet(db, workspace_id)
    if w.available_cents <= 0:
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            "Insufficient wallet balance — top up to continue.",
        )
