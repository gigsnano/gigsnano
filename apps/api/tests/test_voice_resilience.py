"""Resilience under failure (GIN-523).

Each test is one way a voice session can break in production. They are written
against the real modules rather than mocks, so what they prove is what ships:

- a provider outage costs the microphone and never the assistant;
- no failure path executes a write the user has not confirmed;
- retry and reconnect cannot produce a second work item;
- the kill switch and the profile rollback actually work when engaged, rather
  than being rehearsed once by hand and assumed thereafter.

Load and soak are deliberately absent — they need a deployed environment and a
traffic generator, and a fake one here would prove nothing while looking green.
"""

from datetime import datetime, timedelta, timezone

import pytest

from gigsnano_api.features.voice import service as S
from gigsnano_api.features.voice.governance import (
    COHORT,
    EScope,
    KillSwitch,
    PilotCohort,
    PolicyViolation,
    Usage,
    resolve,
    voice_available,
)
from gigsnano_api.features.voice.policy import NonceLedger, enforce
from gigsnano_api.features.voice.profile import ProfileRegistry, VoiceProfile
from gigsnano_api.features.voice.write import (
    ESource,
    IdempotencyLedger,
    Receipt,
    Sourced,
    build_create,
)
from gigsnano_api.voice.commands import parse_command
from gigsnano_api.voice.contracts import VOICE_SCHEMA_VERSION, EVoiceEvent, VoiceEvent, VoiceProtocolError, ordered

NOW = datetime(2026, 3, 4, 12, 0, tzinfo=timezone.utc)
ENABLED = {EScope.WORKSPACE: {"enabled": True}}


def a_write():
    return parse_command({
        "intent": "create",
        "tool": "create_work_item",
        "fields": {
            "project": {"state": "resolved", "value": "p-1", "confidence": 1.0},
            "title": {"state": "resolved", "value": "Login fails", "confidence": 1.0},
        },
    })


def a_proposal():
    return build_create({
        "project": Sourced("p-1", ESource.SPOKEN),
        "title": Sourced("Login fails", ESource.SPOKEN),
    })


@pytest.fixture(autouse=True)
def clean():
    S.reset_sessions()
    yield
    S.reset_sessions()


# ── Provider outage ──────────────────────────────────────────────────────────


def test_a_provider_outage_leaves_the_assistant_usable():
    """Losing the microphone must never cost the user the assistant."""
    policy = resolve(ENABLED)
    switch = KillSwitch()
    switch.engage(by="sre", reason="provider outage", now=NOW)

    verdict = voice_available(
        policy,
        workspace_slug="acme",
        usage=Usage(),
        switch=switch,
        cohort=PilotCohort(workspace_slugs=frozenset({"acme"})),
    )
    assert verdict.available is False
    assert verdict.fallback_to_text is True


def test_an_outage_does_not_execute_a_pending_write():
    """The dangerous shortcut would be "flush what we had before falling back"."""
    assert not enforce(a_write(), confirmed=False).allowed


def test_every_unavailable_reason_still_falls_back_to_text():
    policy = resolve(ENABLED)
    cohort = PilotCohort(workspace_slugs=frozenset({"acme"}))
    cases = [
        # quota exhausted
        voice_available(policy, workspace_slug="acme", usage=Usage(minutes=10_000),
                        switch=KillSwitch(), cohort=cohort),
        # not in the pilot
        voice_available(policy, workspace_slug="other", usage=Usage(),
                        switch=KillSwitch(), cohort=cohort),
        # workspace has not enabled it
        voice_available(resolve(), workspace_slug="acme", usage=Usage(),
                        switch=KillSwitch(), cohort=cohort),
    ]
    for verdict in cases:
        assert verdict.available is False
        assert verdict.fallback_to_text is True
        assert verdict.reason


# ── Reconnect and retry ──────────────────────────────────────────────────────


def test_reconnect_then_retry_produces_at_most_one_work_item():
    """The duplicate-item bug, end to end: the socket dies after the write is
    confirmed, the client reconnects and asks again."""
    ledger = IdempotencyLedger()
    proposal = a_proposal()
    key = proposal.idempotency_key(session_id="vs_1")

    assert ledger.replay(key) is None
    ledger.record(key, Receipt(
        action="create", proposal_hash=proposal.hash, idempotency_key=key,
        correlation_id="corr-1", result_id="s-9", result_code="CHS-9",
    ))

    # Reconnect: same session, same confirmed proposal, so the same key.
    again = a_proposal().idempotency_key(session_id="vs_1")
    replayed = ledger.replay(again)
    assert replayed is not None
    assert replayed.result_code == "CHS-9"
    assert replayed.outcome == "deduplicated"


def test_a_reconnect_never_replays_unconfirmed_work():
    record, _ = S.start_session(
        actor_id="u-1", workspace_slug="acme", locale="en-AE",
        agent_profile_version=1, origin="https://app.gigsnano.com",
    )
    S.heartbeat(record, transcript_final="create a bug", draft={"title": "Login fails"})
    S.note_speaking(record.session_id)
    S.note_partial(record.session_id, "and also-")

    state, _ = S.reconnect(record)
    assert state["pending_audio_dropped"] is True
    assert state["requires_confirmation"] is True  # the draft returns as a proposal
    assert "also-" not in str(state)


def test_a_dropped_connection_during_execution_reports_rather_than_re_runs():
    record, _ = S.start_session(
        actor_id="u-1", workspace_slug="acme", locale="en-AE",
        agent_profile_version=1, origin="https://app.gigsnano.com",
    )
    S.note_execution(record.session_id, idempotency_key="idem-1")
    state, _ = S.reconnect(record)
    assert state["in_flight"] == {"idempotency_key": "idem-1"}
    assert state["requires_confirmation"] is False


# ── Transport faults ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_out_of_order_events_fail_safe_rather_than_corrupting_the_turn():
    async def scrambled():
        for seq in (1, 3, 2):
            yield VoiceEvent(
                version=VOICE_SCHEMA_VERSION, seq=seq,
                type=EVoiceEvent.TRANSCRIPT_PARTIAL,
                session_id="vs_1", correlation_id="corr-1", text="x",
            )

    with pytest.raises(VoiceProtocolError):
        async for _ in ordered(scrambled()):
            pass


@pytest.mark.asyncio
async def test_a_duplicated_event_is_refused():
    """Packet-level duplication must not double-append a transcript line."""
    async def doubled():
        for seq in (1, 1):
            yield VoiceEvent(
                version=VOICE_SCHEMA_VERSION, seq=seq,
                type=EVoiceEvent.TRANSCRIPT_FINAL,
                session_id="vs_1", correlation_id="corr-1", text="create a bug",
            )

    with pytest.raises(VoiceProtocolError):
        async for _ in ordered(doubled()):
            pass


def test_a_replayed_confirmation_is_rejected():
    ledger = NonceLedger()
    assert ledger.spend("confirm-1", now=NOW) is True
    assert ledger.spend("confirm-1", now=NOW) is False


def test_an_expired_session_cannot_be_resumed_after_a_long_outage():
    record, _ = S.start_session(
        actor_id="u-1", workspace_slug="acme", locale="en-AE",
        agent_profile_version=1, origin="https://app.gigsnano.com",
    )
    S.expire_now(record.session_id)
    with pytest.raises(S.SessionGone):
        S.require_live(record.session_id, "u-1")


# ── Kill switch and rollback, rehearsed ──────────────────────────────────────


def test_the_kill_switch_stops_new_sessions_without_stranding_live_drafts():
    switch = KillSwitch()
    live, _ = S.start_session(
        actor_id="u-1", workspace_slug="acme", locale="en-AE",
        agent_profile_version=1, origin="https://app.gigsnano.com",
    )
    S.heartbeat(live, draft={"title": "half-written"})

    switch.engage(by="sre", reason="incident", now=NOW)

    assert switch.blocks_new_session() is True
    # The in-flight draft survives, and the session can still be reconnected.
    assert switch.blocks_existing_session() is False
    state, _ = S.reconnect(live)
    assert state["draft"] == {"title": "half-written"}


def test_the_kill_switch_never_takes_the_audit_trail_with_it():
    switch = KillSwitch()
    switch.engage(by="sre", reason="incident", now=NOW)
    assert switch.blocks_audit_access() is False


def test_rollback_restores_the_previous_profile_for_new_sessions():
    registry = ProfileRegistry()
    registry.publish(VoiceProfile(version=1))
    registry.publish(VoiceProfile(version=2))
    assert registry.active().version == 2
    assert registry.rollback(1).version == 1
    assert registry.active().version == 1


def test_releasing_the_kill_switch_restores_service():
    switch = KillSwitch()
    switch.engage(by="sre", reason="incident", now=NOW)
    switch.release()
    verdict = voice_available(
        resolve(ENABLED), workspace_slug="acme", usage=Usage(),
        switch=switch, cohort=PilotCohort(workspace_slugs=frozenset({"acme"})),
    )
    assert verdict.available is True


# ── Staged rollout ───────────────────────────────────────────────────────────


def test_the_pilot_admits_only_named_workspaces():
    cohort = PilotCohort(workspace_slugs=frozenset({"acme"}))
    assert cohort.admits("acme") is True
    assert cohort.admits("other") is False


def test_the_pilot_cannot_widen_before_the_exit_criteria_are_met():
    """A percentage rollout expands on its own as the user base grows. Widening
    a pilot has to be a decision with a name attached."""
    cohort = PilotCohort(workspace_slugs=frozenset({"acme"}))
    with pytest.raises(PolicyViolation, match="exit criteria"):
        cohort.widen(to=frozenset({"globex"}))
    with pytest.raises(PolicyViolation, match="exit criteria"):
        cohort.open_up()


def test_the_pilot_widens_once_the_exit_criteria_are_recorded():
    cohort = PilotCohort(workspace_slugs=frozenset({"acme"}), exit_criteria_met=True)
    wider = cohort.widen(to=frozenset({"globex"}))
    assert wider.admits("globex") is True
    assert cohort.admits("globex") is False  # the original is untouched


def test_general_availability_is_a_separate_deliberate_step():
    cohort = PilotCohort(workspace_slugs=frozenset({"acme"}), exit_criteria_met=True)
    assert cohort.admits("stranger") is False
    assert cohort.open_up().admits("stranger") is True


def test_the_shipped_default_cohort_is_empty():
    """Nobody is in the pilot until someone is put in it."""
    assert COHORT.workspace_slugs == frozenset()
    assert COHORT.open_to_everyone is False
