from gigsnano_api.agent.tools.bundles import (
    BUNDLE_KEYS,
    BUNDLES,
    VOICE_TOOL_ALIASES,
    registry_for,
)
from gigsnano_api.voice.commands import ALLOWED_TOOLS


def _names(registry):
    return {d["name"] for d in registry.anthropic_defs()}


def test_every_voice_allowed_tool_maps_to_a_real_tool():
    """ALLOWED_TOOLS speaks MCP names; the runner speaks its own. If the mapping
    rots, an agent's voice surface silently empties — so it fails here instead."""
    every_tool = {t.name for b in BUNDLES.values() for t in b.tools}
    for mcp_name in ALLOWED_TOOLS:
        runner_name = VOICE_TOOL_ALIASES.get(mcp_name, mcp_name)
        assert runner_name in every_tool, f"{mcp_name} maps to unknown tool {runner_name}"


def test_voice_session_cannot_exceed_the_reviewed_surface():
    """The load-bearing rule: an agent granted EVERY bundle still reaches no tool
    outside the profile's allow-list."""
    allowed_runner_names = {VOICE_TOOL_ALIASES.get(n, n) for n in ALLOWED_TOOLS}
    granted = _names(registry_for(list(BUNDLE_KEYS), voice=True))
    assert granted <= allowed_runner_names
    assert granted, "the intersection must not be empty, or voice can do nothing"


def test_text_session_keeps_the_full_bundle_surface():
    voice_names = _names(registry_for(list(BUNDLE_KEYS), voice=True))
    text_names = _names(registry_for(list(BUNDLE_KEYS), voice=False))
    assert voice_names < text_names, "voice must be strictly narrower than text"


def test_unknown_bundle_is_ignored_not_fatal():
    # A row written before a bundle was renamed must not 500 the call screen.
    assert _names(registry_for(["work_items", "nope"], voice=False)) == _names(
        registry_for(["work_items"], voice=False)
    )


def test_empty_bundles_yields_an_empty_registry():
    assert _names(registry_for([], voice=False)) == set()


def test_a_create_proposal_can_never_carry_a_field_the_tool_drops():
    """I1. `apply_proposal` hands `Proposal.payload` to `create_work_item`
    verbatim, and the tool keeps only what its schema names. A field voice can
    propose but the tool does not accept is spoken aloud, confirmed by the user,
    silently discarded -- and the receipt still says `applied`. That is precisely
    the failure this feature exists to prevent, so it fails here instead."""
    from gigsnano_api.agent.tools.work_items import CREATE_WORK_ITEM_SCHEMA
    from gigsnano_api.features.voice.write import CREATE_FIELDS

    droppable = set(CREATE_FIELDS) - set(CREATE_WORK_ITEM_SCHEMA["properties"])
    assert not droppable, f"proposable but silently dropped: {sorted(droppable)}"


def test_build_create_refuses_a_field_the_tool_would_drop():
    """The same invariant from the other end: the value-level guard, not just the
    name list, so a proposal genuinely cannot be built around a dropped field."""
    import pytest

    from gigsnano_api.features.voice import write

    spoken = lambda v: write.Sourced(value=v, source=write.ESource.SPOKEN)  # noqa: E731
    with pytest.raises(write.ProposalRejected):
        write.build_create({
            "project": spoken("p1"), "title": spoken("Fix the header"),
            "assignee": spoken("Divya"),
        })
