import logging

from sqlalchemy import select

from gigsnano_api.models import ConnectAccount
from gigsnano_api.payments.provider import PaymentProvider

logger = logging.getLogger("gigsnano.billing")


async def get_or_create_connect(db, provider: PaymentProvider, user_id: str) -> ConnectAccount:
    acct = (await db.execute(
        select(ConnectAccount).where(ConnectAccount.user_id == user_id)
    )).scalar_one_or_none()
    if acct is None:
        stripe_account_id = await provider.create_connect_account(user_id)
        acct = ConnectAccount(user_id=user_id, stripe_account_id=stripe_account_id)
        db.add(acct)
        await db.flush()
    return acct


async def refresh_status(db, provider: PaymentProvider, acct: ConnectAccount) -> ConnectAccount:
    try:
        status, payouts = await provider.account_status(acct.stripe_account_id)
    except Exception:
        # A stale/fake or revoked Stripe account id (e.g. a `fake_acct_*` left over
        # from keyless-dev, or a deleted account) must not 500 the billing page —
        # keep the last-known status so the connect widget still renders.
        logger.warning(
            "connect account_status failed for %s; keeping stored status",
            acct.stripe_account_id, exc_info=True,
        )
        return acct
    acct.status = status
    acct.payouts_enabled = payouts
    await db.flush()
    return acct
