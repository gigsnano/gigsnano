"""The ledger engine — the ONLY place wallet balances are mutated.

Every mutation locks the wallet row (SELECT ... FOR UPDATE), appends an
append-only WalletTransaction, updates the cached available/held, and returns
the txn. Callers commit. Amounts are positive integer USD cents.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.models import EWalletTxnType, Wallet, WalletTransaction


class InsufficientBalance(Exception):
    """Raised when available balance can't cover a debit or hold."""


async def get_or_create_wallet(db: AsyncSession, workspace_id: str) -> Wallet:
    row = (
        await db.execute(select(Wallet).where(Wallet.workspace_id == workspace_id))
    ).scalar_one_or_none()
    if row is None:
        row = Wallet(workspace_id=workspace_id)
        db.add(row)
        await db.flush()
    return row


async def _locked_wallet(db: AsyncSession, workspace_id: str) -> Wallet:
    await get_or_create_wallet(db, workspace_id)  # ensure it exists
    return (
        await db.execute(
            select(Wallet).where(Wallet.workspace_id == workspace_id).with_for_update()
        )
    ).scalar_one()


def _txn(w: Wallet, type_, amount_cents, ref_type, ref_id, stripe_ref) -> WalletTransaction:
    return WalletTransaction(
        wallet_id=w.id, type=type_, amount_cents=amount_cents,
        available_after=w.available_cents, held_after=w.held_cents,
        ref_type=ref_type, ref_id=ref_id, stripe_ref=stripe_ref,
    )


async def credit(db, workspace_id, amount_cents, *, ref_type, ref_id=None, stripe_ref=None):
    w = await _locked_wallet(db, workspace_id)
    w.available_cents += amount_cents
    txn = _txn(w, EWalletTxnType.TOPUP, amount_cents, ref_type, ref_id, stripe_ref)
    db.add(txn)
    await db.flush()
    return txn


async def debit(db, workspace_id, amount_cents, *, ref_type, ref_id=None):
    w = await _locked_wallet(db, workspace_id)
    if w.available_cents < amount_cents:
        raise InsufficientBalance(f"available {w.available_cents} < debit {amount_cents}")
    w.available_cents -= amount_cents
    txn = _txn(w, EWalletTxnType.DEBIT, amount_cents, ref_type, ref_id, None)
    db.add(txn)
    await db.flush()
    return txn


async def hold(db, workspace_id, bid_cents, fee_cents, *, ref_id):
    total = bid_cents + fee_cents
    w = await _locked_wallet(db, workspace_id)
    if w.available_cents < total:
        raise InsufficientBalance(f"available {w.available_cents} < hold {total}")
    w.available_cents -= total
    w.held_cents += total
    txn = _txn(w, EWalletTxnType.HOLD, total, "contract", ref_id, None)
    db.add(txn)
    await db.flush()
    return txn


async def release(db, workspace_id, total_cents, *, ref_id):
    w = await _locked_wallet(db, workspace_id)
    w.held_cents -= total_cents
    w.available_cents += total_cents
    txn = _txn(w, EWalletTxnType.RELEASE, total_cents, "contract", ref_id, None)
    db.add(txn)
    await db.flush()
    return txn


async def capture(db, workspace_id, bid_cents, fee_cents, *, ref_id):
    total = bid_cents + fee_cents
    w = await _locked_wallet(db, workspace_id)
    w.held_cents -= total  # held funds leave the wallet (paid out + fee kept)
    cap = _txn(w, EWalletTxnType.CAPTURE, bid_cents, "contract", ref_id, None)
    fee = _txn(w, EWalletTxnType.FEE, fee_cents, "contract", ref_id, None)
    db.add_all([cap, fee])
    await db.flush()
    return cap, fee
