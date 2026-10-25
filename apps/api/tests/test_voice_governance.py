"""Versioned profile, policy inheritance, quotas and kill switch (GIN-514/517)."""

from datetime import datetime, timezone

import pytest

from gigsnano_api.features.voice.governance import (
    PLATFORM_DEFAULTS,
    EScope,
    KillSwitch,
    PolicyLog,
    PolicyViolation,
    Usage,
    check_quota,
    resolve,
    with_override,
)
from gigsnano_api.features.voice.profile import (
    REQUIRED_SKILLS,
    EProfileStatus,
    ProfileInvalid,
    ProfileRegistry,
    SchemaPins,
    VoiceProfile,
    stamp,
)
from gigsnano_api.voice.commands import ALLOWED_TOOLS

NOW = datetime(2026, 3, 4, 12, 0, tzinfo=timezone.utc)


# ── Profile (GIN-514) ────────────────────────────────────────────────────────


def test_a_complete_profile_publishes():
    registry = ProfileRegistry()
    published = registry.publish(VoiceProfile(version=1))
    assert published.status is EProfileStatus.PUBLISHED
    assert registry.active().version == 1


def test_publishing_fails_when_a_required_skill_is_missing():
    """A missing policy checker is not a degraded assistant, it is an ungoverned
    one — so it must fail at publish, not mid-utterance."""
    incomplete = VoiceProfile(version=1, skills=REQUIRED_SKILLS - {"permission_policy_checker"})
    with pytest.raises(ProfileInvalid, match="missing required skills"):
        ProfileRegistry().publish(incomplete)


def test_a_profile_cannot_grant_itself_a_tool_outside_the_voice_surface():
    rogue = VoiceProfile(version=1, tools=frozenset(ALLOWED_TOOLS | {"delete_work_item"}))
    with pytest.raises(ProfileInvalid, match="outside the voice surface"):
        ProfileRegistry().publish(rogue)


def test_tools_are_deny_by_default():
    assert "delete_work_item" not in VoiceProfile(version=1).tools
    assert VoiceProfile(version=1).tools <= ALLOWED_TOOLS


def test_publishing_fails_on_a_schema_this_build_cannot_speak():
    stale = VoiceProfile(version=1, pins=SchemaPins(command=99))
    with pytest.raises(ProfileInvalid, match="not what this build speaks"):
        ProfileRegistry().publish(stale)


def test_publishing_deprecates_the_previous_version():
    registry = ProfileRegistry()
    first = registry.publish(VoiceProfile(version=1))
    registry.publish(VoiceProfile(version=2))
    assert first.status is EProfileStatus.DEPRECATED
    assert registry.active().version == 2


def test_rollback_makes_a_prior_version_active_for_new_sessions():
    registry = ProfileRegistry()
    registry.publish(VoiceProfile(version=1))
    registry.publish(VoiceProfile(version=2))
    assert registry.rollback(1).version == 1
    assert registry.active().version == 1


def test_rollback_revalidates_rather_than_trusting_that_it_once_published():
    """Rolling into a broken profile during an incident is the worst moment to
    discover it pins a schema this build no longer speaks."""
    registry = ProfileRegistry()
    registry.publish(VoiceProfile(version=1))
    registry.publish(VoiceProfile(version=2))
    registry._versions[1].pins = SchemaPins(voice=99)
    with pytest.raises(ProfileInvalid):
        registry.rollback(1)


def test_rollback_to_an_unknown_version_is_refused():
    with pytest.raises(ProfileInvalid, match="no such profile version"):
        ProfileRegistry().rollback(7)


def test_a_session_can_record_exactly_what_it_ran_under():
    """Without this, a model or schema change silently rewrites the history of
    every past session."""
    marked = stamp(VoiceProfile(version=3))
    assert marked.profile_version == 3
    assert marked.command_schema == SchemaPins().command


# ── Policy inheritance (GIN-517) ─────────────────────────────────────────────


def test_the_effective_policy_is_platform_defaults_when_nothing_overrides():
    policy = resolve()
    assert policy["require_confirmation"] is True
    assert policy.source_of("require_confirmation") is EScope.PLATFORM


def test_the_innermost_scope_wins():
    policy = resolve({
        EScope.ENVIRONMENT: {"monthly_minutes_quota": 1000},
        EScope.WORKSPACE: {"monthly_minutes_quota": 100},
    })
    assert policy["monthly_minutes_quota"] == 100
    assert policy.source_of("monthly_minutes_quota") is EScope.WORKSPACE


def test_every_value_can_be_explained():
    """A policy you cannot explain is one nobody trusts during an incident."""
    explained = resolve({EScope.WORKSPACE: {"enabled": True}}).explain()
    assert "from workspace" in explained["enabled"]
    assert "from platform" in explained["require_confirmation"]


def test_a_workspace_cannot_switch_confirmation_off():
    with pytest.raises(PolicyViolation, match="require_confirmation"):
        resolve({EScope.WORKSPACE: {"require_confirmation": False}})


def test_a_workspace_cannot_widen_the_tool_surface():
    with pytest.raises(PolicyViolation, match="tools"):
        resolve({EScope.WORKSPACE: {"tools": frozenset(ALLOWED_TOOLS | {"delete_work_item"})}})


def test_a_workspace_cannot_extend_a_session_past_the_platform_maximum():
    with pytest.raises(PolicyViolation, match="max_session_minutes"):
        resolve({EScope.WORKSPACE: {"max_session_minutes": 999}})


def test_a_workspace_may_always_be_stricter():
    """Floors are one-directional: tightening is a workspace's own business."""
    policy = resolve({
        EScope.WORKSPACE: {"max_session_minutes": 5, "tools": frozenset({"list_work_items"})}
    })
    assert policy["max_session_minutes"] == 5
    assert policy["tools"] == frozenset({"list_work_items"})


def test_an_unknown_policy_key_is_refused_rather_than_silently_stored():
    with pytest.raises(PolicyViolation, match="unknown policy key"):
        resolve({EScope.WORKSPACE: {"allow_everything": True}})


def test_voice_is_off_until_a_workspace_turns_it_on():
    assert PLATFORM_DEFAULTS["enabled"] is False
    assert resolve({EScope.WORKSPACE: {"enabled": True}})["enabled"] is True


def test_an_override_applied_later_still_faces_the_floor():
    policy = resolve()
    with pytest.raises(PolicyViolation):
        with_override(policy, "require_confirmation", False, EScope.PROJECT)


# ── Quotas ───────────────────────────────────────────────────────────────────


def test_an_exhausted_quota_degrades_to_text_rather_than_blocking():
    """Losing the microphone is an inconvenience; losing the assistant is an
    outage."""
    policy = resolve()
    check = check_quota(policy, Usage(minutes=policy["monthly_minutes_quota"]))
    assert check.allowed is False
    assert check.fallback_to_text is True


def test_the_spend_cap_also_degrades_to_text():
    policy = resolve()
    assert check_quota(policy, Usage(spend=policy["monthly_spend_cap"])).fallback_to_text is True


def test_usage_within_quota_is_allowed():
    assert check_quota(resolve(), Usage(minutes=1, spend=1.0)).allowed is True


# ── Kill switch ──────────────────────────────────────────────────────────────


def test_the_kill_switch_stops_new_sessions():
    switch = KillSwitch()
    switch.engage(by="u-1", reason="provider incident", now=NOW)
    assert switch.blocks_new_session() is True


def test_the_kill_switch_leaves_live_sessions_to_finish():
    """Tearing down active sessions strands half-confirmed drafts, which is worse
    than letting a few turns complete under the old policy."""
    switch = KillSwitch()
    switch.engage(by="u-1", reason="provider incident", now=NOW)
    assert switch.blocks_existing_session() is False


def test_the_kill_switch_never_blocks_audit_access():
    """An incident is exactly when the audit trail is needed."""
    switch = KillSwitch()
    switch.engage(by="u-1", reason="incident", now=NOW)
    assert switch.blocks_audit_access() is False


def test_releasing_the_switch_restores_new_sessions():
    switch = KillSwitch()
    switch.engage(by="u-1", reason="x", now=NOW)
    switch.release()
    assert switch.blocks_new_session() is False


def test_engaging_records_who_and_why():
    switch = KillSwitch()
    switch.engage(by="u-9", reason="runaway spend", now=NOW)
    assert (switch.by, switch.reason, switch.at) == ("u-9", "runaway spend", NOW)


# ── Change history ───────────────────────────────────────────────────────────


def test_policy_changes_record_actor_before_after_and_time():
    log = PolicyLog()
    log.record(
        scope=EScope.WORKSPACE, key="enabled", before=False, after=True, actor_id="u-1", now=NOW
    )
    entry = log.for_key("enabled")[0]
    assert (entry.before, entry.after, entry.actor_id, entry.at) == (False, True, "u-1", NOW)
