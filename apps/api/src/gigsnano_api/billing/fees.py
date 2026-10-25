"""Platform fee math + live-rate accessor. Single source for fee calculation."""

from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.config import settings
from gigsnano_api.models import PlatformConfig

_SINGLETON_ID = "platform"


def compute_fee_cents(bid_cents: int, fee_bps: int) -> int:
    """Percentage-on-top fee in cents, rounded half-up."""
    return (bid_cents * fee_bps + 5000) // 10000


async def get_platform_fee_bps(db: AsyncSession) -> int:
    row = await db.get(PlatformConfig, _SINGLETON_ID)
    if row is None:
        row = PlatformConfig(id=_SINGLETON_ID, platform_fee_bps=settings.platform_fee_bps)
        db.add(row)
        await db.flush()
    return row.platform_fee_bps
