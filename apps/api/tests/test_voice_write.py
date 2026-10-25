"""Governed voice writes (GIN-496): drafts, confirmation binding, idempotency,
optimistic concurrency.

These are the tests that decide whether the assistant can be trusted with a
shared backlog, so most of them assert a refusal.
"""

from datetime import datetime, timedelta, timezone

import pytest

from gigsnano_api.features.voice.write import (
    CONFIRMATION_TTL_SECONDS,
    ConfirmationExpired,
    ESource,
    IdempotencyLedger,
    ProposalRejected,
    Receipt,
    Sourced,
    StaleWrite,
    authorise,
    build_create,
    build_update,
    check_not_stale,
    confirm,
    delta,
)

NOW = datetime(2026, 3, 4, 12, 0, tzinfo=timezone.utc)
ACTOR, SESSION = "u-1", "vs_abc"


def spoken(v):
    return Sourced(value=v, source=ESource.SPOKEN)


def a_create(**over):
    fields = {"project": spoken("p-1"), "title": spoken("Login fails after OTP")}
    fields.update(over)
    return build_create(fields)


# ── Drafting ─────────────────────────────────────────────────────────────────


def test_a_draft_missing_a_required_field_cannot_be_built_at_all():
    """AC: no create tool is called while required fields are missing. Making the
    proposal unrepresentable beats remembering to check at the call site."""
    with pytest.raises(ProposalRejected, match="missing required fields"):
        build_create({"title": spoken("Orphan")})


def test_a_field_voice_may_not_write_is_refused():
    with pytest.raises(ProposalRejected, match="not writable by voice"):
        build_create({"project": spoken("p-1"), "title": spoken("x"), "workspace_id": spoken("w-9")})


def test_every_field_carries_where_it_came_from():
    proposal = a_create(
        priority=Sourced("high", ESource.DEFAULT),
        description=Sourced("Generated from the utterance.", ESource.GENERATED),
    )
    assert proposal.fields["title"].source is ESource.SPOKEN
    assert proposal.inferred_fields == ["description", "priority"]


def test_inferred_fields_are_distinguishable_from_spoken_ones():
    """Confirming a due date you never said is the quiet failure of a drafting
    agent; the only defence is showing which parts it made up."""
    proposal = a_create(target_date=Sourced("2026-03-10", ESource.GENERATED))
    assert "target_date" in proposal.inferred_fields
    assert "title" not in proposal.inferred_fields


def test_an_update_that_changes_nothing_is_refused():
    with pytest.raises(ProposalRejected, match="nothing would change"):
        build_update("s-1", {"title": "Same"}, {"title": spoken("Same")}, updated_at=NOW)


def test_an_update_only_carries_fields_that_actually_change():
    proposal = build_update(
        "s-1",
        {"title": "Old", "priority": "high"},
        {"title": spoken("New"), "priority": spoken("high")},
        updated_at=NOW,
    )
    assert set(proposal.fields) == {"title"}


def test_destructive_fields_are_not_updatable_by_voice():
    for forbidden in ("deleted_at", "project_id", "workspace_id"):
        with pytest.raises(ProposalRejected, match="not updatable by voice"):
            build_update("s-1", {}, {forbidden: spoken("x")}, updated_at=NOW)


def test_the_preview_is_a_before_and_after():
    proposal = build_update("s-1", {"title": "Old"}, {"title": spoken("New")}, updated_at=NOW)
    assert delta({"title": "Old"}, proposal) == {"title": ("Old", "New")}


# ── Confirmation binds to exactly one proposal ───────────────────────────────


def test_yes_confirms_the_proposal_that_was_shown():
    proposal = a_create()
    ok = confirm(proposal, actor_id=ACTOR, session_id=SESSION, now=NOW)
    authorise(proposal, ok, actor_id=ACTOR, session_id=SESSION, now=NOW)


def test_changing_a_field_expires_the_confirmation():
    """The single most important test in this file."""
    shown = a_create()
    approval = confirm(shown, actor_id=ACTOR, session_id=SESSION, now=NOW)
    edited = a_create(title=spoken("Login fails after OTP on Android"))
    with pytest.raises(ConfirmationExpired, match="proposal changed"):
        authorise(edited, approval, actor_id=ACTOR, session_id=SESSION, now=NOW)


def test_an_unconfirmed_write_is_refused_rather_than_warned_about():
    with pytest.raises(ConfirmationExpired, match="not been confirmed"):
        authorise(a_create(), None, actor_id=ACTOR, session_id=SESSION, now=NOW)


def test_a_confirmation_cannot_arm_another_actors_draft():
    proposal = a_create()
    approval = confirm(proposal, actor_id=ACTOR, session_id=SESSION, now=NOW)
    with pytest.raises(ConfirmationExpired, match="different actor or session"):
        authorise(proposal, approval, actor_id="u-2", session_id=SESSION, now=NOW)


def test_a_confirmation_does_not_survive_into_another_session():
    proposal = a_create()
    approval = confirm(proposal, actor_id=ACTOR, session_id=SESSION, now=NOW)
    with pytest.raises(ConfirmationExpired, match="different actor or session"):
        authorise(proposal, approval, actor_id=ACTOR, session_id="vs_other", now=NOW)


def test_a_confirmation_ages_out():
    proposal = a_create()
    approval = confirm(proposal, actor_id=ACTOR, session_id=SESSION, now=NOW)
    later = NOW + timedelta(seconds=CONFIRMATION_TTL_SECONDS + 1)
    with pytest.raises(ConfirmationExpired, match="expired"):
        authorise(proposal, approval, actor_id=ACTOR, session_id=SESSION, now=later)


def test_provenance_alone_does_not_invalidate_an_approval():
    """Re-deriving the same text from a different source is the same write. The
    hash covers values, not where they came from."""
    generated = a_create(description=Sourced("Same words.", ESource.GENERATED))
    respoken = a_create(description=Sourced("Same words.", ESource.SPOKEN))
    assert generated.hash == respoken.hash


def test_the_hash_covers_the_target_not_just_the_payload():
    """Otherwise an approval for editing one item would authorise editing another
    with identical values."""
    one = build_update("s-1", {"title": "a"}, {"title": spoken("b")}, updated_at=NOW)
    two = build_update("s-2", {"title": "a"}, {"title": spoken("b")}, updated_at=NOW)
    assert one.hash != two.hash


# ── Idempotency ──────────────────────────────────────────────────────────────


def test_a_retry_of_the_same_confirmed_write_is_deduplicated():
    """The duplicate-work-item bug: the socket dies between request and response,
    the client asks again, and the backlog gains a twin."""
    ledger = IdempotencyLedger()
    proposal = a_create()
    key = proposal.idempotency_key(session_id=SESSION)

    assert ledger.replay(key) is None
    ledger.record(key, Receipt(
        action="create", proposal_hash=proposal.hash, idempotency_key=key,
        correlation_id="corr-1", result_id="s-9", result_code="CHS-9",
    ))

    replayed = ledger.replay(key)
    assert replayed is not None
    assert replayed.result_code == "CHS-9"
    assert replayed.outcome == "deduplicated"


def test_the_same_proposal_produces_a_stable_key_across_retries():
    assert a_create().idempotency_key(session_id=SESSION) == a_create().idempotency_key(
        session_id=SESSION
    )


def test_a_different_proposal_gets_a_different_key():
    other = a_create(title=spoken("Something else"))
    assert a_create().idempotency_key(session_id=SESSION) != other.idempotency_key(
        session_id=SESSION
    )


def test_the_same_bug_filed_deliberately_from_two_sessions_is_two_items():
    """Session-scoped, not global: a dropped connection is one item, but a user
    genuinely filing the same thing twice tomorrow is two."""
    assert a_create().idempotency_key(session_id="vs_a") != a_create().idempotency_key(
        session_id="vs_b"
    )


def test_the_receipt_links_the_confirmed_proposal_to_the_created_item():
    proposal = a_create()
    receipt = Receipt(
        action="create",
        proposal_hash=proposal.hash,
        idempotency_key=proposal.idempotency_key(session_id=SESSION),
        correlation_id="corr-7",
        result_id="s-9",
        result_code="CHS-9",
    )
    assert receipt.proposal_hash == proposal.hash
    assert receipt.correlation_id == "corr-7"


# ── Optimistic concurrency ───────────────────────────────────────────────────


def test_an_update_against_a_newer_item_is_refused():
    """Seconds pass between proposing, speaking and confirming — enough for a
    teammate to move the same item. Overwriting them silently is the outcome."""
    proposal = build_update("s-1", {"title": "Old"}, {"title": spoken("New")}, updated_at=NOW)
    with pytest.raises(StaleWrite) as caught:
        check_not_stale(proposal, NOW + timedelta(seconds=30))
    assert "updated_at" in caught.value.changed


def test_an_unchanged_item_passes_the_staleness_check():
    proposal = build_update("s-1", {"title": "Old"}, {"title": spoken("New")}, updated_at=NOW)
    check_not_stale(proposal, NOW)


def test_a_create_has_nothing_to_be_stale_against():
    check_not_stale(a_create(), NOW)
