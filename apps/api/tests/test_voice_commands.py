"""Voice command schema gate (GIN-505).

This module is the only door between a language model and a GigsNano tool, so
most of these tests are about what must NOT get through.
"""

import pytest

from gigsnano_api.voice.commands import (
    ALLOWED_TOOLS,
    COMMAND_SCHEMA_VERSION,
    Blocked,
    Candidate,
    Clarification,
    EFieldState,
    ERiskClass,
    EVoiceIntent,
    ResolvedField,
    SchemaRejected,
    VoiceCommand,
    parse_command,
    triage,
)


def resolved(value):
    return {"state": "resolved", "value": value, "confidence": 1.0}


def read_command(**over):
    return {"intent": "read", "tool": "list_work_items", **over}


def create_command(**over):
    return {
        "intent": "create",
        "tool": "create_work_item",
        "fields": {"project": resolved("p-1"), "title": resolved("Login fails")},
        **over,
    }


# ── What must not get through ────────────────────────────────────────────────


def test_an_unknown_tool_is_refused():
    """A hallucinated tool name must die at the schema, not at the dispatcher."""
    with pytest.raises(SchemaRejected, match="not reachable by voice"):
        parse_command(read_command(tool="delete_everything"))


def test_destructive_tools_are_not_even_nameable():
    for tool in ("delete_work_item", "bulk_update_work_items", "update_project_autonomy_policy"):
        assert tool not in ALLOWED_TOOLS
        with pytest.raises(SchemaRejected):
            parse_command(read_command(tool=tool))


def test_unknown_fields_are_rejected_not_ignored():
    """A silently dropped field is how 'assign to Divya' becomes 'assign to nobody'."""
    with pytest.raises(SchemaRejected):
        parse_command(read_command(assignee="Divya"))


def test_a_newer_schema_version_is_refused():
    with pytest.raises(SchemaRejected, match="unsupported command schema version"):
        parse_command(read_command(version=COMMAND_SCHEMA_VERSION + 1))


def test_the_current_version_is_accepted_explicitly_or_by_default():
    assert parse_command(read_command()).version == COMMAND_SCHEMA_VERSION
    assert parse_command(read_command(version=COMMAND_SCHEMA_VERSION)).version == (
        COMMAND_SCHEMA_VERSION
    )


def test_non_object_output_is_refused():
    with pytest.raises(SchemaRejected):
        parse_command("create a bug")


def test_confidence_outside_zero_to_one_is_refused():
    with pytest.raises(SchemaRejected):
        parse_command(
            read_command(fields={"project": {"state": "resolved", "confidence": 4.2}})
        )


# ── Risk classification is ours, not the model's ─────────────────────────────


def test_risk_is_derived_from_intent():
    assert parse_command(read_command()).risk is ERiskClass.READ_ONLY
    assert parse_command(create_command()).risk is ERiskClass.MATERIAL_WRITE


def test_a_mutating_tool_outranks_a_benign_intent():
    """The escalation that matters: a model claiming intent=read while asking for
    create_work_item must not be executed as a read."""
    command = parse_command(read_command(tool="create_work_item"))
    assert command.risk is ERiskClass.MATERIAL_WRITE


def test_risk_cannot_be_supplied_by_the_model():
    with pytest.raises(SchemaRejected):
        parse_command(create_command(risk="read_only"))


def test_unsupported_intent_is_blocked_with_a_reason():
    blocked = triage(parse_command({"intent": "unsupported"}))
    assert isinstance(blocked, Blocked)
    assert blocked.risk is ERiskClass.HIGH_RISK
    assert blocked.reason


# ── Field states drive different answers ─────────────────────────────────────


def test_missing_required_field_asks_for_it():
    result = triage(parse_command({"intent": "create", "tool": "create_work_item"}))
    assert isinstance(result, Clarification)
    assert result.field == "project"


def test_ambiguous_field_offers_the_candidates():
    command = parse_command(
        create_command(
            fields={
                "project": {
                    "state": "ambiguous",
                    "candidates": [
                        {"id": "p-1", "label": "Chess", "evidence": "said 'chess'"},
                        {"id": "p-2", "label": "Chess Portal", "evidence": "said 'chess'"},
                    ],
                },
                "title": resolved("Login fails"),
            }
        )
    )
    result = triage(command)
    assert isinstance(result, Clarification)
    assert [c.label for c in result.candidates] == ["Chess", "Chess Portal"]


def test_inaccessible_field_is_answered_exactly_like_missing():
    """Saying "that project exists but isn't yours" leaks the org chart to anyone
    with a microphone."""
    inaccessible = triage(
        parse_command(
            create_command(
                fields={
                    "project": {"state": "inaccessible", "value": "p-secret"},
                    "title": resolved("x"),
                }
            )
        )
    )
    missing = triage(parse_command({"intent": "create", "tool": "create_work_item"}))
    assert isinstance(inaccessible, Clarification)
    assert inaccessible.question == missing.question
    assert "p-secret" not in str(inaccessible)


def test_invalid_field_asks_for_a_correction():
    result = triage(
        parse_command(
            create_command(
                fields={
                    "project": {"state": "invalid", "value": "??"},
                    "title": resolved("x"),
                }
            )
        )
    )
    assert isinstance(result, Clarification)
    assert "isn't valid" in result.question


def test_a_complete_command_passes_triage_unchanged():
    command = parse_command(create_command())
    assert triage(command) is command
    assert command.unresolved() == []


def test_one_question_at_a_time():
    """Two missing fields must not become two questions — a voice interface that
    asks three things at once gets three half-answers."""
    result = triage(parse_command({"intent": "comment", "tool": "add_comment"}))
    assert isinstance(result, Clarification)
    assert result.field == "code"


# ── Compatibility ────────────────────────────────────────────────────────────


def test_optional_fields_may_be_omitted_entirely():
    """Backward compatibility: a producer that sends only what it knows still parses."""
    command = parse_command({"intent": "read"})
    assert command.tool is None
    assert command.fields == {}


def test_resolved_field_round_trips_through_serialisation():
    field = ResolvedField(
        state=EFieldState.AMBIGUOUS,
        candidates=[Candidate(id="u-1", label="Divya Nair", confidence=0.6)],
    )
    assert ResolvedField.model_validate(field.model_dump()) == field


def test_every_intent_has_a_risk_class():
    """A new intent without a risk mapping would KeyError at triage time — in
    production, mid-utterance."""
    for intent in EVoiceIntent:
        assert VoiceCommand(intent=intent).risk in set(ERiskClass)
