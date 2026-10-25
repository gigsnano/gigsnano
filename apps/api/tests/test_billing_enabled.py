"""BILLING_ENABLED: self-hosted installs (default off) never hit the wallet wall."""
import pytest
from fastapi import HTTPException

from gigsnano_api.auth.models import User
from gigsnano_api.billing import wallet as W
from gigsnano_api.billing.enforcement import ensure_positive_balance
from gigsnano_api.core.config import Settings, settings
from gigsnano_api.llm.pricing import DEFAULT_MODEL
from gigsnano_api.llm.usage import record_llm_usage
from gigsnano_api.models import ELlmUsageOperation, ELlmUsageSource, Workspace


async def _workspace_user(db_session, slug: str):
    user = User(email=f"{slug}@example.test", display_name="Billing User", password_hash="x")
    ws = Workspace(slug=slug, name="Billing Workspace")
    db_session.add_all([user, ws])
    await db_session.flush()
    return ws, user


@pytest.mark.asyncio
async def test_balance_guard_noop_when_billing_disabled(db_session, monkeypatch):
    monkeypatch.setattr(settings, "billing_enabled", False)
    ws, _ = await _workspace_user(db_session, "bill-off")
    await ensure_positive_balance(db_session, ws.id)  # empty wallet, must not raise


@pytest.mark.asyncio
async def test_balance_guard_402_when_billing_enabled(db_session, monkeypatch):
    monkeypatch.setattr(settings, "billing_enabled", True)
    ws, _ = await _workspace_user(db_session, "bill-on")
    with pytest.raises(HTTPException) as exc:
        await ensure_positive_balance(db_session, ws.id)
    assert exc.value.status_code == 402


@pytest.mark.asyncio
async def test_usage_recorded_but_not_debited_when_disabled(db_session, monkeypatch):
    monkeypatch.setattr(settings, "billing_enabled", False)
    ws, user = await _workspace_user(db_session, "bill-usage")
    await W.credit(db_session, ws.id, 10_000, ref_type="test")
    event = await record_llm_usage(
        db_session,
        workspace_id=ws.id,
        user_id=user.id,
        source=ELlmUsageSource.BMAD_STORY,
        operation=ELlmUsageOperation.STREAM_TURN,
        model=DEFAULT_MODEL,
        input_tokens=1_000_000,
        output_tokens=1_000_000,
        is_fake=False,
    )
    assert event.estimated_cost_usd is not None
    wallet = await W.get_or_create_wallet(db_session, ws.id)
    assert wallet.available_cents == 10_000


@pytest.mark.asyncio
async def test_usage_debited_when_enabled(db_session, monkeypatch):
    monkeypatch.setattr(settings, "billing_enabled", True)
    ws, user = await _workspace_user(db_session, "bill-debit")
    await W.credit(db_session, ws.id, 10_000, ref_type="test")
    await record_llm_usage(
        db_session,
        workspace_id=ws.id,
        user_id=user.id,
        source=ELlmUsageSource.BMAD_STORY,
        operation=ELlmUsageOperation.STREAM_TURN,
        model=DEFAULT_MODEL,
        input_tokens=1_000_000,
        output_tokens=1_000_000,
        is_fake=False,
    )
    wallet = await W.get_or_create_wallet(db_session, ws.id)
    assert wallet.available_cents < 10_000


def test_billing_disabled_by_default(monkeypatch):
    monkeypatch.delenv("BILLING_ENABLED", raising=False)
    assert Settings(_env_file=None).billing_enabled is False


def test_billing_enabled_reads_env(monkeypatch):
    monkeypatch.setenv("BILLING_ENABLED", "true")
    assert Settings(_env_file=None).billing_enabled is True
