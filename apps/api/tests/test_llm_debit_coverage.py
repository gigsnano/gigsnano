"""GIN-152: every LLM call is paid for, and no new call path can quietly skip it.

The epic's premise is "ensure every LLM call deducts from the workspace wallet".
That claim is the kind that's true in seven places and false in the eighth — the
digest's AI note ran unbilled for exactly that reason (fixed in 6098452), and 86%
of AI spend was unpriced before d38bb22. So this file does two jobs:

1. Pin the debit behaviour of `record_llm_usage`, which was almost untested — the
   existing tests only covered that an event row is written.
2. Assert *structurally* that every module calling the LLM provider is accounted
   for, so a new call site can't be added without someone deciding who pays.
"""

import inspect
import pathlib
import re

import pytest
from sqlalchemy import select

from gigsnano_api.auth.models import User
from gigsnano_api.billing import wallet
from gigsnano_api.llm.pricing import DEFAULT_MODEL
from gigsnano_api.llm.usage import record_llm_usage
from gigsnano_api.models import (
    ELlmUsageOperation,
    ELlmUsageSource,
    EWalletTxnType,
    WalletTransaction,
    Workspace,
)

SRC = pathlib.Path(__file__).resolve().parents[1] / "src" / "gigsnano_api"

# Big enough that a real cost rounds to >= 1 cent.
_TOKENS = {"input_tokens": 200_000, "output_tokens": 50_000}


async def _workspace_user(db_session, slug="debit-ws"):
    user = User(email=f"{slug}@example.test", display_name="Debit User", password_hash="x")
    ws = Workspace(slug=slug, name="Debit Workspace")
    db_session.add_all([user, ws])
    await db_session.flush()
    return ws, user


async def _record(db_session, ws, user, **over):
    return await record_llm_usage(
        db_session,
        workspace_id=ws.id,
        user_id=user.id,
        source=ELlmUsageSource.GIGS_AI,
        operation=ELlmUsageOperation.STREAM_TURN,
        model=DEFAULT_MODEL,
        **{**_TOKENS, **over},
    )


# --- the debit itself ---------------------------------------------------------


@pytest.mark.asyncio
async def test_a_real_call_debits_the_wallet(db_session):
    ws, user = await _workspace_user(db_session)
    await wallet.credit(db_session, ws.id, 10_000, ref_type="topup")
    before = (await wallet.get_or_create_wallet(db_session, ws.id)).available_cents

    event = await _record(db_session, ws, user)

    after = (await wallet.get_or_create_wallet(db_session, ws.id)).available_cents
    assert event.estimated_cost_usd is not None and event.estimated_cost_usd > 0
    assert after < before, "a priced LLM call must reduce the wallet"
    assert before - after == int(round(float(event.estimated_cost_usd) * 100))


@pytest.mark.asyncio
async def test_the_debit_leaves_an_audit_trail_pointing_at_the_event(db_session):
    ws, user = await _workspace_user(db_session, "audit-ws")
    await wallet.credit(db_session, ws.id, 10_000, ref_type="topup")
    event = await _record(db_session, ws, user)

    rows = (
        await db_session.execute(
            select(WalletTransaction).where(WalletTransaction.type == EWalletTxnType.DEBIT)
        )
    ).scalars().all()
    debits = list(rows)
    assert len(debits) == 1
    # The ledger row must be traceable back to the call that caused it.
    assert debits[0].ref_type == "ai_usage"
    assert debits[0].ref_id == event.id


@pytest.mark.asyncio
async def test_debit_false_records_the_cost_without_charging_for_it(db_session):
    """System-initiated work (the digest's AI note) is real money we must see, but
    charging a user for work they never asked for is a product decision."""
    ws, user = await _workspace_user(db_session, "nodebit-ws")
    await wallet.credit(db_session, ws.id, 10_000, ref_type="topup")
    before = (await wallet.get_or_create_wallet(db_session, ws.id)).available_cents

    event = await _record(db_session, ws, user, debit=False)

    after = (await wallet.get_or_create_wallet(db_session, ws.id)).available_cents
    assert after == before, "debit=False must not charge"
    assert event.estimated_cost_usd > 0, "...but the cost must still be visible"


@pytest.mark.asyncio
async def test_a_fake_call_is_free_and_charges_nothing(db_session):
    ws, user = await _workspace_user(db_session, "fake-ws")
    await wallet.credit(db_session, ws.id, 10_000, ref_type="topup")
    before = (await wallet.get_or_create_wallet(db_session, ws.id)).available_cents

    event = await _record(db_session, ws, user, is_fake=True)

    after = (await wallet.get_or_create_wallet(db_session, ws.id)).available_cents
    assert event.estimated_cost_usd is None
    assert after == before


@pytest.mark.asyncio
async def test_an_overspending_call_clamps_instead_of_going_negative(db_session):
    """The usage already happened; we can't un-spend it. Clamp to available rather
    than let the wallet go negative — the pre-call 402 guard is what should stop
    us reaching here."""
    ws, user = await _workspace_user(db_session, "poor-ws")
    await wallet.credit(db_session, ws.id, 5, ref_type="topup")  # 5c, nowhere near enough

    await _record(db_session, ws, user)

    w = await wallet.get_or_create_wallet(db_session, ws.id)
    assert w.available_cents == 0, "clamped to zero"
    assert w.available_cents >= 0, "a wallet must never go negative"


@pytest.mark.asyncio
async def test_an_empty_wallet_records_the_event_and_survives(db_session):
    # No credit at all: the debit can't happen, but losing the usage row would
    # hide the spend entirely.
    ws, user = await _workspace_user(db_session, "empty-ws")
    event = await _record(db_session, ws, user)
    assert event.id is not None
    assert (await wallet.get_or_create_wallet(db_session, ws.id)).available_cents == 0


# --- the structural guard -----------------------------------------------------

# Every module that calls the LLM provider must appear here with who pays for it.
# A new call site failing this test is not a broken test — it's an LLM call nobody
# has decided how to bill. Add it with a reason.
LLM_CALL_SITES: dict[str, str] = {
    # Records its own usage.
    "bmad/description.py": "self",
    "bmad/finalize.py": "self",
    # Records via the router that drives it.
    "bmad/generate_description.py": "features/ai_assistant/router.py",
    "agent/runner.py": "features/gigs_ai/router.py + bmad/router.py",
    "features/experts/orchestrator.py": "features/experts/router.py",
    "features/digests/ai.py": "features/digests/service.py (debit=False — system-initiated)",
    "features/workflows/gate.py": "self",  # evaluate_gate records source=gate
    "features/intake/engine.py": "features/intake/router.py",       # process bills source=intake
    "features/automations/compiler.py": "features/automations/router.py",  # bills source=automation
    "features/templates/drafter.py": "features/templates/router.py",       # bills source=template
    "features/roadmap/drafter.py": "features/roadmap/router.py",           # bills source=roadmap
    "features/meetings/notes.py": "self",  # generate_notes bills source=meeting_notes to the meeting creator
    "features/package_import/analysis.py": "features/package_import/router.py",  # bills source=package_import
    "features/voice/turn.py": "self",  # run_voice_turn bills source=voice
    # Deliberately unbilled: internal CLI eval harness. It has no user or
    # workspace to charge, and is not a user-facing operation. It IS our API key,
    # so if it ever runs on a schedule rather than by hand, it needs recording
    # with debit=False — the same call the digest's AI note makes.
    "context_engine/eval/optimize.py": "UNBILLED: internal CLI eval harness",
    "context_engine/eval/scoring.py": "UNBILLED: internal CLI eval harness",
    "context_engine/eval/harness.py": "UNBILLED: internal CLI eval harness",
}

def _records(src: str) -> bool:
    """`record_tally` is the tally-based wrapper around `record_llm_usage`."""
    return "record_llm_usage" in src or "record_tally" in src


_PROVIDER_CALL = re.compile(r"\.(stream_turn|extract|stream_round)\s*\(")


def _modules_calling_the_provider() -> set[str]:
    found = set()
    for path in SRC.rglob("*.py"):
        rel = path.relative_to(SRC).as_posix()
        if rel.startswith("bmad/provider.py") or "__pycache__" in rel:
            continue  # the provider defines these, it doesn't call them
        if _PROVIDER_CALL.search(path.read_text(encoding="utf-8")):
            found.add(rel)
    return found


def test_every_llm_call_site_has_someone_who_pays_for_it():
    """The 8th-place guard. `record_llm_usage` is wired into the paths we know
    about; this fails when a new one appears undeclared."""
    undeclared = _modules_calling_the_provider() - set(LLM_CALL_SITES)
    assert not undeclared, (
        "These modules call the LLM provider but aren't declared in LLM_CALL_SITES. "
        "Decide who pays (record it, or document why it's unbilled), then add it: "
        f"{sorted(undeclared)}"
    )


def test_declared_call_sites_still_exist():
    """Keeps the map honest in the other direction — a stale entry would let a real
    gap hide behind a name nothing matches any more."""
    gone = [m for m in LLM_CALL_SITES if not (SRC / m).exists()]
    assert not gone, f"LLM_CALL_SITES lists modules that no longer exist: {gone}"


@pytest.mark.parametrize(
    "module", [m for m, owner in LLM_CALL_SITES.items() if owner == "self"]
)
def test_self_recording_call_sites_actually_record(module):
    src = (SRC / module).read_text(encoding="utf-8")
    assert _records(src), f"{module} claims to record its own usage but doesn't"


@pytest.mark.parametrize(
    "owner",
    sorted(
        {
            o.split(" ")[0]
            for o in LLM_CALL_SITES.values()
            if o != "self" and not o.startswith("UNBILLED")
        }
    ),
)
def test_declared_recording_owners_actually_record(owner):
    # Owners are recorded as "path.py" or "path.py + other.py"; check the first.
    src = (SRC / owner).read_text(encoding="utf-8")
    assert _records(src), f"{owner} is declared as the payer but never records"


def test_record_llm_usage_debits_by_default():
    """A new caller that forgets to think about billing should still be charged.
    Defaulting to debit=False would make unbilled spend the silent default."""
    sig = inspect.signature(record_llm_usage)
    assert sig.parameters["debit"].default is True
