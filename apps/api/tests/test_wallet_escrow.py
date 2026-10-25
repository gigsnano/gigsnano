import pytest

from gigsnano_api.billing import wallet as W


async def _funded(db, make_workspace, cents=5000):
    ws = await make_workspace()
    await W.credit(db, ws.id, cents, ref_type="topup")
    return ws


async def test_hold_moves_available_to_held(db_session, make_workspace):
    ws = await _funded(db_session, make_workspace)
    await W.hold(db_session, ws.id, 1000, 200, ref_id="c1")  # $10 + $2
    w = await W.get_or_create_wallet(db_session, ws.id)
    assert w.available_cents == 3800
    assert w.held_cents == 1200


async def test_hold_insufficient_raises(db_session, make_workspace):
    ws = await _funded(db_session, make_workspace, cents=1000)
    with pytest.raises(W.InsufficientBalance):
        await W.hold(db_session, ws.id, 1000, 200, ref_id="c1")


async def test_release_returns_held(db_session, make_workspace):
    ws = await _funded(db_session, make_workspace)
    await W.hold(db_session, ws.id, 1000, 200, ref_id="c1")
    await W.release(db_session, ws.id, 1200, ref_id="c1")
    w = await W.get_or_create_wallet(db_session, ws.id)
    assert w.available_cents == 5000
    assert w.held_cents == 0


async def test_capture_drains_held_and_records_fee(db_session, make_workspace):
    ws = await _funded(db_session, make_workspace)
    await W.hold(db_session, ws.id, 1000, 200, ref_id="c1")
    cap, fee = await W.capture(db_session, ws.id, 1000, 200, ref_id="c1")
    w = await W.get_or_create_wallet(db_session, ws.id)
    assert w.held_cents == 0
    assert w.available_cents == 3800
    assert cap.amount_cents == 1000
    assert fee.amount_cents == 200
