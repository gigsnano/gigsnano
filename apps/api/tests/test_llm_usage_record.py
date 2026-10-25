import pytest

from gigsnano_api.auth.models import User
from gigsnano_api.llm.pricing import DEFAULT_MODEL
from gigsnano_api.llm.usage import record_llm_usage
from gigsnano_api.models import (
    ELlmUsageOperation,
    ELlmUsageSource,
    LlmUsageEvent,
    Workspace,
)


async def _workspace_user(db_session):
    user = User(email="llm@example.test", display_name="LLM User", password_hash="x")
    ws = Workspace(slug="llm-ws", name="LLM Workspace")
    db_session.add_all([user, ws])
    await db_session.flush()
    return ws, user


@pytest.mark.asyncio
async def test_record_llm_usage_persists_event(db_session):
    ws, user = await _workspace_user(db_session)
    event = await record_llm_usage(
        db_session,
        workspace_id=ws.id,
        user_id=user.id,
        source=ELlmUsageSource.BMAD_STORY,
        operation=ELlmUsageOperation.STREAM_TURN,
        model=DEFAULT_MODEL,
        input_tokens=100,
        output_tokens=50,
        is_fake=False,
    )
    assert event.total_tokens == 150
    assert event.estimated_cost_usd is not None
    row = await db_session.get(LlmUsageEvent, event.id)
    assert row is not None


@pytest.mark.asyncio
async def test_record_llm_usage_fake_has_null_cost(db_session):
    ws, user = await _workspace_user(db_session)
    event = await record_llm_usage(
        db_session,
        workspace_id=ws.id,
        user_id=user.id,
        source=ELlmUsageSource.GIGS_AI,
        operation=ELlmUsageOperation.STREAM_TURN,
        model=DEFAULT_MODEL,
        input_tokens=100,
        output_tokens=50,
        is_fake=True,
    )
    assert event.total_tokens == 150
    assert event.estimated_cost_usd is None
