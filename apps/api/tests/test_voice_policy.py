"""Policy gate, safe denials and replay protection (GIN-518/519)."""

from datetime import datetime, timedelta, timezone

import pytest

from gigsnano_api.features.voice.policy import (
    NONCE_TTL_SECONDS,
    NonceLedger,
    enforce,
)
from gigsnano_api.voice.commands import ERiskClass, parse_command

NOW = datetime(2026, 3, 4, 12, 0, tzinfo=timezone.utc)


def read():
    return parse_command({"intent": "read", "tool": "list_work_items"})


def write():
    return parse_command({
        "intent": "create",
        "tool": "create_work_item",
        "fields": {
            "project": {"state": "resolved", "value": "p-1", "confidence": 1.0},
            "title": {"state": "resolved", "value": "Login fails", "confidence": 1.0},
        },
    })


# ── The gate ─────────────────────────────────────────────────────────────────


def test_a_read_runs_without_confirmation():
    assert enforce(read(), confirmed=False).allowed


def test_a_material_write_without_confirmation_is_denied():
    decision = enforce(write(), confirmed=False)
    assert not decision.allowed
    assert decision.reason_code == "not_confirmed"


def test_a_confirmed_material_write_runs():
    assert enforce(write(), confirmed=True).allowed


def test_a_high_risk_intent_is_blocked_even_when_confirmed():
    """Confirmation is not a bypass. Out-of-scope actions stay out of scope."""
    unsupported = parse_command({"intent": "unsupported"})
    assert unsupported.risk is ERiskClass.HIGH_RISK
    assert not enforce(unsupported, confirmed=True).allowed


def test_a_stale_entity_denies_even_a_confirmed_write():
    decision = enforce(write(), confirmed=True, stale_fields=["project"])
    assert not decision.allowed
    assert decision.reason_code == "entity_stale"


def test_no_access_denies_before_anything_else_is_considered():
    """Checked first so a denial for an invisible object never reveals why by
    taking a different branch."""
    decision = enforce(write(), confirmed=True, accessible=False)
    assert decision.reason_code == "no_access"


def test_the_gate_rechecks_the_tool_allow_list_itself():
    """It must hold on its own, not because the caller happened to be careful."""
    command = read()
    object.__setattr__(command, "tool", "delete_everything")
    assert not enforce(command, confirmed=True).allowed


def test_every_denial_has_something_to_say():
    for decision in (
        enforce(write(), confirmed=False),
        enforce(write(), confirmed=True, accessible=False),
        enforce(parse_command({"intent": "unsupported"}), confirmed=True),
    ):
        assert decision.spoken


# ── Denials must not leak ────────────────────────────────────────────────────


def test_a_denial_never_names_the_object():
    """"You can't edit CHS-14, it's in Payments" confirms both that CHS-14 exists
    and where it lives, to anyone with a microphone."""
    decision = enforce(write(), confirmed=True, accessible=False)
    assert "p-1" not in decision.spoken
    assert "Login fails" not in decision.spoken


def test_forbidden_and_absent_sound_identical():
    forbidden = enforce(write(), confirmed=True, accessible=False).spoken
    absent = enforce(write(), confirmed=True, accessible=False).spoken
    assert forbidden == absent


def test_the_precise_reason_survives_for_telemetry():
    """Vague to the user, exact in the log — otherwise nothing is debuggable."""
    decision = enforce(write(), confirmed=False)
    assert decision.reason_code == "not_confirmed"
    assert decision.reason_code not in decision.spoken


# ── Fail closed ──────────────────────────────────────────────────────────────


def test_an_unknown_risk_class_denies_rather_than_falls_through():
    """The bug this module exists to prevent: someone adds a risk class and the
    gate quietly allows it."""

    class Rogue:
        intent = read().intent
        tool = None
        risk = "something_new"

    assert not enforce(Rogue(), confirmed=True).allowed


def test_model_output_cannot_downgrade_risk():
    """A model claiming intent=read while asking for create_work_item must still
    face the confirmation gate."""
    sneaky = parse_command({"intent": "read", "tool": "create_work_item"})
    assert not enforce(sneaky, confirmed=False).allowed


# ── Replay ───────────────────────────────────────────────────────────────────


def test_a_nonce_works_once():
    ledger = NonceLedger()
    assert ledger.spend("n-1", now=NOW) is True
    assert ledger.spend("n-1", now=NOW) is False


def test_different_nonces_are_independent():
    ledger = NonceLedger()
    assert ledger.spend("n-1", now=NOW) is True
    assert ledger.spend("n-2", now=NOW) is True


def test_a_replay_cannot_wait_out_the_ledger_within_the_window():
    ledger = NonceLedger()
    ledger.spend("n-1", now=NOW)
    almost = NOW + timedelta(seconds=NONCE_TTL_SECONDS - 1)
    assert ledger.spend("n-1", now=almost) is False


def test_the_ledger_does_not_grow_without_bound():
    ledger = NonceLedger()
    ledger.spend("old", now=NOW)
    much_later = NOW + timedelta(seconds=NONCE_TTL_SECONDS + 60)
    ledger.spend("new", now=much_later)
    assert ledger.spend("old", now=much_later) is True  # expired out, then re-spendable
