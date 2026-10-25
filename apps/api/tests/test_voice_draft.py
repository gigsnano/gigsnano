"""Resumable multimodal drafts and corrections (GIN-508)."""

import pytest

from gigsnano_api.features.voice.draft import (
    Draft,
    DraftClosed,
    EDraftStatus,
    EModality,
    abandon,
    apply_correction,
    clear_field,
    confirm,
    restore,
)
from gigsnano_api.voice.commands import EFieldState, ResolvedField


def value(v):
    return ResolvedField(state=EFieldState.RESOLVED, value=v, confidence=1.0)


def started() -> Draft:
    draft = Draft()
    draft = apply_correction(draft, "project", value("p-1"), modality=EModality.VOICE)
    return apply_correction(draft, "title", value("Login fails"), modality=EModality.VOICE)


def test_a_correction_changes_only_the_field_named():
    draft = started()
    fixed = apply_correction(draft, "title", value("Login fails after OTP"), modality=EModality.TEXT)
    assert fixed.fields["title"].value == "Login fails after OTP"
    assert fixed.fields["project"].value == "p-1"


def test_a_correction_records_what_it_replaced():
    draft = started()
    fixed = apply_correction(draft, "title", value("Login fails after OTP"), modality=EModality.TEXT)
    trail = fixed.provenance["title"]
    assert trail.previous == "Login fails"
    assert trail.modality is EModality.TEXT


def test_switching_modality_keeps_one_draft():
    """Voice then keyboard is the same draft with different provenance — not a
    merge of two, which is where a field goes missing."""
    draft = started()
    typed = apply_correction(draft, "priority", value("high"), modality=EModality.TEXT)
    spoken = apply_correction(typed, "assignee", value("u-1"), modality=EModality.VOICE)
    assert {"project", "title", "priority", "assignee"} <= set(spoken.fields)
    assert spoken.provenance["priority"].modality is EModality.TEXT
    assert spoken.provenance["assignee"].modality is EModality.VOICE


def test_correcting_does_not_mutate_the_draft_a_reconnect_may_still_hold():
    draft = started()
    apply_correction(draft, "title", value("Something else"), modality=EModality.VOICE)
    assert draft.fields["title"].value == "Login fails"


# ── The confirmation seal ────────────────────────────────────────────────────


def test_confirmation_authorises_the_exact_proposal():
    sealed = confirm(started())
    assert sealed.confirmation_is_valid


def test_an_edit_after_confirmation_voids_it():
    """The whole point: an approval given for one proposal cannot authorise a
    different one."""
    sealed = confirm(started())
    changed = apply_correction(sealed, "priority", value("urgent"), modality=EModality.VOICE)
    assert not changed.confirmation_is_valid
    assert changed.status is EDraftStatus.OPEN


def test_even_a_cosmetic_looking_edit_voids_the_confirmation():
    """No definition of "cosmetic" is safe for someone else's write."""
    sealed = confirm(started())
    retitled = apply_correction(sealed, "title", value("Login fails "), modality=EModality.TEXT)
    assert not retitled.confirmation_is_valid


def test_an_unconfirmed_draft_is_never_valid():
    assert not started().confirmation_is_valid


# ── Clearing and abandoning ──────────────────────────────────────────────────


def test_a_user_can_explicitly_clear_project_context():
    cleared = clear_field(started(), "project", modality=EModality.VOICE)
    assert cleared.fields["project"].state is EFieldState.MISSING
    assert cleared.provenance["project"].previous == "p-1"


def test_an_abandoned_draft_cannot_be_edited_back_to_life():
    dropped = abandon(started())
    with pytest.raises(DraftClosed):
        apply_correction(dropped, "title", value("zombie"), modality=EModality.VOICE)


def test_abandoning_drops_any_confirmation():
    assert not abandon(confirm(started())).confirmation_is_valid


# ── Reconnect ────────────────────────────────────────────────────────────────


def test_restore_round_trips_an_acknowledged_draft():
    draft = confirm(started())
    restored = restore(draft.model_dump(mode="json"))
    assert restored is not None
    assert restored.fields["title"].value == "Login fails"
    assert restored.confirmation_is_valid


def test_restore_is_idempotent_so_a_double_reconnect_cannot_duplicate_state():
    payload = started().model_dump(mode="json")
    assert restore(payload) == restore(payload)


def test_restoring_nothing_is_not_an_error():
    assert restore(None) is None
    assert restore({}) is None


def test_an_abandoned_draft_does_not_come_back_on_reconnect():
    assert restore(abandon(started()).model_dump(mode="json")) is None


def test_a_newer_draft_schema_is_dropped_rather_than_half_read():
    payload = started().model_dump(mode="json") | {"schema_version": 99}
    assert restore(payload) is None
