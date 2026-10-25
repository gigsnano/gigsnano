"""GIN-32: the workspace AI assistant (work-item description / create-work-item
generation) runs a real LLM call but historically never recorded usage, so the
wallet was never debited — AI cost was not reduced based on usage. Every other AI
path (BMAD chat, GigsAI chat, finalize, finalize-description) already debits.
"""

from sqlalchemy import select

from gigsnano_api.billing import wallet as W
from gigsnano_api.bmad.provider import ExtractResult
from gigsnano_api.models import EWalletTxnType, LlmUsageEvent, WalletTransaction, Workspace


class _PaidProvider:
    """Non-Fake provider returning a valid extraction with token counts, so the
    ai-assistant path must record usage and debit (is_fake=False)."""

    async def extract(self, *, system, messages, tool_name, schema):
        # Enough tokens that the cost is ≥ 1 cent (sub-cent usage rounds to 0 and,
        # by design, is not debited).
        return ExtractResult(
            data={"title": "Sign-in", "markdown": "# Sign-in\n\nLet users sign in."},
            input_tokens=100_000,
            output_tokens=100_000,
        )


async def _auth(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})


async def test_ai_assistant_debits_wallet_on_real_usage(client, app, db_session):
    await _auth(client)
    ws = (
        await db_session.execute(select(Workspace).where(Workspace.slug == "acme"))
    ).scalar_one()
    ws_id = ws.id  # capture before commit so later queries don't lazy-reload
    await W.credit(db_session, ws_id, 100_00, ref_type="topup")  # $100
    await db_session.commit()

    app.state.llm_provider = _PaidProvider()
    res = await client.post("/api/workspaces/acme/ai-assistant/", json={
        "prompt": "Sign-in flow", "task": "Generate a description for this work item.",
    })
    assert res.status_code == 200

    # Fresh queries against tables db_session hasn't loaded → see the endpoint's commit.
    events = (
        await db_session.execute(
            select(LlmUsageEvent).where(LlmUsageEvent.workspace_id == ws_id)
        )
    ).scalars().all()
    assert len(events) == 1
    assert events[0].estimated_cost_usd is not None

    debit = (
        await db_session.execute(
            select(WalletTransaction).where(WalletTransaction.type == EWalletTxnType.DEBIT)
        )
    ).scalars().first()
    assert debit is not None  # AI usage debited the wallet
    assert debit.available_after < 100_00  # balance reduced by AI cost
