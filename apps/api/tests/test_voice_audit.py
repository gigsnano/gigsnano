"""Redaction, action audit and retention (GIN-520)."""

from datetime import datetime, timedelta, timezone

from gigsnano_api.features.voice.audit import (
    DEFAULT_TRANSCRIPT_RETENTION_DAYS,
    RETAIN_RAW_AUDIO,
    ActionAudit,
    TranscriptRecord,
    VoiceStore,
    log_safe,
    redact,
)

NOW = datetime(2026, 3, 4, 12, 0, tzinfo=timezone.utc)


# ── Redaction ────────────────────────────────────────────────────────────────


def test_secrets_and_pii_are_scrubbed():
    dirty = (
        "email ada@example.com, card 4111 1111 1111 1111, "
        "token eyJhbGciOi.eyJzdWIi.abc123, key sk_live_abcd1234, phone +971 50 123 4567"
    )
    clean = redact(dirty)
    for leak in ("ada@example.com", "4111", "eyJhbGciOi", "sk_live_abcd1234", "50 123 4567"):
        assert leak not in clean


def test_ordinary_speech_survives_redaction():
    said = "Create a high priority bug for the mobile login failure in Chess"
    assert redact(said) == said


# ── Log payloads carry shape, not content ────────────────────────────────────


def test_a_transcript_passed_by_accident_does_not_reach_the_log():
    """The failure this guards: a well-meaning caller logging the whole payload."""
    payload = log_safe(
        action="create",
        transcript="Create a bug about the Halcyon acquisition slipping to Q4",
        correlation_id="corr-1",
    )
    assert payload["action"] == "create"
    assert payload["correlation_id"] == "corr-1"
    assert "Halcyon" not in str(payload)
    assert payload["transcript"].startswith("str(")


def test_audio_never_reaches_the_log_even_as_bytes():
    payload = log_safe(audio=b"\x00\x01\x02\x03")
    assert payload["audio"] == "bytes(4)"


def test_collections_are_reduced_to_their_size():
    payload = log_safe(draft={"title": "secret", "project": "p-1"})
    assert payload["draft"] == "dict(2)"
    assert "secret" not in str(payload)


def test_whitelisted_fields_are_still_redacted():
    """Being safe to log is not the same as being safe as written."""
    assert "ada@example.com" not in str(log_safe(reason_code="denied for ada@example.com"))


def test_raw_audio_retention_is_off_by_default():
    assert RETAIN_RAW_AUDIO is False


# ── Audit proves what happened ───────────────────────────────────────────────


def an_audit(**over):
    base = dict(
        correlation_id="corr-1",
        actor_id="u-1",
        session_id="vs_1",
        action="create",
        target_id=None,
        proposal_hash="hash-abc",
        proposed={"title": "Login fails", "project": "p-1"},
        policy_result="allowed",
        confirmed=True,
        applied={"id": "s-9", "code": "CHS-9"},
        outcome="applied",
        at=NOW,
    )
    return ActionAudit(**{**base, **over})


def test_the_audit_links_the_confirmed_proposal_to_the_actual_result():
    record = an_audit()
    assert record.proves(proposal_hash="hash-abc")
    assert record.proposed["title"] == "Login fails"
    assert record.applied["code"] == "CHS-9"


def test_an_unconfirmed_record_proves_nothing():
    assert not an_audit(confirmed=False).proves(proposal_hash="hash-abc")


def test_a_record_does_not_prove_a_different_proposal():
    assert not an_audit().proves(proposal_hash="hash-other")


def test_an_audit_record_is_immutable():
    import dataclasses

    import pytest

    with pytest.raises(dataclasses.FrozenInstanceError):
        an_audit().outcome = "rewritten"


# ── Retention ────────────────────────────────────────────────────────────────


def a_store():
    store = VoiceStore()
    store.add_transcript(TranscriptRecord(session_id="vs_1", actor_id="u-1", text="old", at=NOW))
    store.add_audit(an_audit())
    return store


def test_expired_transcripts_are_purged():
    store = a_store()
    later = NOW + timedelta(days=DEFAULT_TRANSCRIPT_RETENTION_DAYS + 1)
    assert store.purge_transcripts(now=later) == 1
    assert store.transcripts == []


def test_transcripts_inside_retention_survive():
    store = a_store()
    assert store.purge_transcripts(now=NOW + timedelta(days=1)) == 0


def test_purging_transcripts_does_not_erase_the_action_audit():
    """Erasing what someone said must not erase the record that a work item was
    created on a shared backlog other people depend on."""
    store = a_store()
    store.purge_transcripts(now=NOW + timedelta(days=365))
    assert len(store.audits) == 1


def test_explicit_deletion_removes_only_that_actors_transcripts():
    store = a_store()
    store.add_transcript(TranscriptRecord(session_id="vs_2", actor_id="u-2", text="theirs", at=NOW))
    assert store.delete_for_actor("u-1") == 1
    assert [t.actor_id for t in store.transcripts] == ["u-2"]


def test_explicit_deletion_also_preserves_action_evidence():
    store = a_store()
    store.delete_for_actor("u-1")
    assert len(store.audits) == 1
