from sqlalchemy import select

from gigsnano_api.models import (
    EWalletTxnType,
    Wallet,
    WalletTransaction,
)


async def test_wallet_defaults(db_session, make_workspace):
    ws = await make_workspace()
    w = Wallet(workspace_id=ws.id)
    db_session.add(w)
    await db_session.commit()
    assert w.available_cents == 0
    assert w.held_cents == 0
    assert w.currency == "usd"


async def test_transaction_enum_and_fields(db_session, make_workspace):
    ws = await make_workspace()
    w = Wallet(workspace_id=ws.id)
    db_session.add(w)
    await db_session.flush()
    txn = WalletTransaction(
        wallet_id=w.id, type=EWalletTxnType.TOPUP, amount_cents=5000,
        available_after=5000, held_after=0, ref_type="topup", ref_id="pi_x",
    )
    db_session.add(txn)
    await db_session.commit()
    row = (await db_session.execute(select(WalletTransaction))).scalar_one()
    assert row.type == EWalletTxnType.TOPUP
    assert row.amount_cents == 5000
