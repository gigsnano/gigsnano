import pytest
from fastapi import HTTPException

from gigsnano_api.billing import wallet as W
from gigsnano_api.billing.enforcement import ensure_positive_balance
from gigsnano_api.llm.usage import record_llm_usage
from gigsnano_api.models import ELlmUsageOperation, ELlmUsageSource


async def test_guard_blocks_empty_wallet(db_session, make_workspace):
    ws = await make_workspace()
    with pytest.raises(HTTPException) as e:
        await ensure_positive_balance(db_session, ws.id)
    assert e.value.status_code == 402


async def test_guard_allows_funded(db_session, make_workspace):
    ws = await make_workspace()
    await W.credit(db_session, ws.id, 100, ref_type="topup")
    await ensure_positive_balance(db_session, ws.id)  # no raise


async def test_record_usage_debits_wallet(db_session, make_workspace, make_user):
    ws = await make_workspace()
    user = make_user()
    db_session.add(user)
    await db_session.flush()
    await W.credit(db_session, ws.id, 100_00, ref_type="topup")  # $100
    await record_llm_usage(
        db_session, workspace_id=ws.id, user_id=user.id,
        source=ELlmUsageSource.BMAD_STORY, operation=ELlmUsageOperation.STREAM_TURN,
        model="claude-haiku-4-5", input_tokens=100_000, output_tokens=100_000, is_fake=False,
    )
    w = await W.get_or_create_wallet(db_session, ws.id)
    assert w.available_cents < 100_00  # cost debited


async def test_fake_usage_does_not_debit(db_session, make_workspace, make_user):
    ws = await make_workspace()
    user = make_user()
    db_session.add(user)
    await db_session.flush()
    await W.credit(db_session, ws.id, 100_00, ref_type="topup")
    await record_llm_usage(
        db_session, workspace_id=ws.id, user_id=user.id,
        source=ELlmUsageSource.BMAD_STORY, operation=ELlmUsageOperation.STREAM_TURN,
        model="claude-haiku-4-5", input_tokens=1000, output_tokens=1000, is_fake=True,
    )
    w = await W.get_or_create_wallet(db_session, ws.id)
    assert w.available_cents == 100_00  # unchanged in keyless dev
