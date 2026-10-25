"""GIN-147: the digest's AI note is a real paid LLM call — record it.

It ran unrecorded and unbilled because it's the one LLM path with no user waiting on
it: `digests/` never called record_llm_usage, and the stream loop collected TurnDelta
text while dropping TurnFinal, which is where the token counts live.
"""

from datetime import datetime, timezone

import pytest
from sqlalchemy import select

from gigsnano_api.bmad.provider import TurnDelta, TurnFinal
from gigsnano_api.features.digests.ai import generate_digest_summary
from gigsnano_api.features.digests.schemas import DigestOut, DigestItemOut, DigestSectionOut
from gigsnano_api.llm.pricing import DEFAULT_MODEL
from gigsnano_api.llm.usage import record_llm_usage
from gigsnano_api.models import (
    ELlmUsageOperation,
    ELlmUsageSource,
    EStoryPriority,
    EStoryStatus,
    LlmUsageEvent,
)


class _Provider:
    """Streams a note and reports tokens on TurnFinal, like the real provider."""

    def __init__(self, in_tok=120, out_tok=30):
        self.in_tok, self.out_tok = in_tok, out_tok

    async def stream_turn(self, **_kwargs):
        yield TurnDelta("Ship ")
        yield TurnDelta("the thing.")
        yield TurnFinal(proposed_finalize=False, input_tokens=self.in_tok, output_tokens=self.out_tok)


def _digest(total_open: int = 1) -> DigestOut:
    item = DigestItemOut(
        story_id="s1",
        code="P-1",
        title="Fix it",
        status=EStoryStatus.TODO,
        priority=EStoryPriority.HIGH,
        target_date=None,
        project_id="p1",
        project_name="P",
        href="/x",
    )
    sections = [DigestSectionOut(key="open", label="Open", count=1, items=[item])] if total_open else []
    return DigestOut(
        workspace_slug="acme",
        user_id="u1",
        generated_at=datetime(2026, 7, 17, tzinfo=timezone.utc),
        total_open=total_open,
        sections=sections,
    )


async def test_summary_reports_the_tokens_it_spent():
    out = await generate_digest_summary(_Provider(), _digest())
    assert out.note == "Ship the thing."
    # The whole bug: these came back None because TurnFinal was dropped.
    assert (out.input_tokens, out.output_tokens) == (120, 30)


async def test_summary_with_nothing_pending_makes_no_call():
    out = await generate_digest_summary(_Provider(), _digest(total_open=0))
    assert out.note == "" and out.input_tokens is None


@pytest.mark.parametrize("debit,expect_charged", [(False, False), (True, True)])
async def test_debit_flag_separates_recording_from_charging(
    db_session, make_project, debit, expect_charged
):
    """The provision: recording is unconditional, charging is a switch. Asserted in
    BOTH positions so 'record only' can't silently become 'record and charge' when
    the AI note turns Pro."""
    from gigsnano_api.billing import wallet

    project = await make_project()
    ws_id = project.workspace_id
    w = await wallet.get_or_create_wallet(db_session, ws_id)
    w.available_cents = 100_000
    await db_session.commit()
    before = (await wallet.get_or_create_wallet(db_session, ws_id)).available_cents

    await record_llm_usage(
        db_session,
        workspace_id=ws_id,
        user_id="u1",
        source=ELlmUsageSource.DIGEST,
        operation=ELlmUsageOperation.STREAM_TURN,
        model=DEFAULT_MODEL,  # an unpriced model yields cost=None and never debits
        input_tokens=100_000,
        output_tokens=50_000,
        debit=debit,
    )
    await db_session.commit()

    # Recorded either way — that's the point: the cost must be visible.
    events = (
        await db_session.execute(
            select(LlmUsageEvent).where(LlmUsageEvent.source == ELlmUsageSource.DIGEST)
        )
    ).scalars().all()
    assert len(events) == 1
    assert events[0].estimated_cost_usd is not None and events[0].estimated_cost_usd > 0

    after = (await wallet.get_or_create_wallet(db_session, ws_id)).available_cents
    assert (after < before) is expect_charged
