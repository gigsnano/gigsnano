import pytest
from sqlalchemy import select

from gigsnano_api.billing import wallet as W
from gigsnano_api.models import WalletTransaction


async def test_credit_increases_available(db_session, make_workspace):
    ws = await make_workspace()
    await W.credit(db_session, ws.id, 5000, ref_type="topup", stripe_ref="pi_1")
    w = await W.get_or_create_wallet(db_session, ws.id)
    assert w.available_cents == 5000
    assert w.held_cents == 0


async def test_debit_reduces_available(db_session, make_workspace):
    ws = await make_workspace()
    await W.credit(db_session, ws.id, 5000, ref_type="topup")
    await W.debit(db_session, ws.id, 1200, ref_type="ai_usage", ref_id="u1")
    w = await W.get_or_create_wallet(db_session, ws.id)
    assert w.available_cents == 3800


async def test_debit_insufficient_raises(db_session, make_workspace):
    ws = await make_workspace()
    await W.credit(db_session, ws.id, 100, ref_type="topup")
    with pytest.raises(W.InsufficientBalance):
        await W.debit(db_session, ws.id, 500, ref_type="ai_usage")
    w = await W.get_or_create_wallet(db_session, ws.id)
    assert w.available_cents == 100  # unchanged


async def test_ledger_replays_to_balance(db_session, make_workspace):
    ws = await make_workspace()
    await W.credit(db_session, ws.id, 5000, ref_type="topup")
    await W.debit(db_session, ws.id, 1000, ref_type="ai_usage")
    txns = (await db_session.execute(select(WalletTransaction))).scalars().all()
    w = await W.get_or_create_wallet(db_session, ws.id)
    assert txns[-1].available_after == w.available_cents
