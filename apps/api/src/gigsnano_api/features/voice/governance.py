"""Policy inheritance, quotas and the kill switch (GIN-517).

Four scopes stack — platform, environment, workspace, project — and the effective
value is the innermost one that set it. Every resolved value carries *where it
came from*, because a policy you cannot explain is a policy nobody trusts during
an incident.

The asymmetry is the important part. Permissive settings inherit downward freely;
**security floors do not**. A workspace may make voice stricter than the platform
and may never make it looser: it cannot widen the tool surface, cannot switch
confirmation off, and cannot extend a session past the platform maximum. Those
are enforced as floors in `resolve`, not as documentation.

The kill switch stops *new* sessions and leaves live ones to finish. Killing
active sessions mid-turn would strand half-confirmed drafts, which is worse than
letting a handful of turns complete under the old policy.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from enum import StrEnum
from typing import Any

from gigsnano_api.voice.commands import ALLOWED_TOOLS


class EScope(StrEnum):
    PLATFORM = "platform"
    ENVIRONMENT = "environment"
    WORKSPACE = "workspace"
    PROJECT = "project"


#: Innermost wins.
_PRECEDENCE = (EScope.PLATFORM, EScope.ENVIRONMENT, EScope.WORKSPACE, EScope.PROJECT)

#: Settings a child scope may never weaken, with the direction of "weaker".
#: Stated once so a new setting has to make a deliberate choice about inheritance.
_NON_OVERRIDABLE = {
    "require_confirmation": "cannot be disabled below platform",
    "tools": "cannot be widened below platform",
    "max_session_minutes": "cannot be extended below platform",
}

PLATFORM_DEFAULTS: dict[str, Any] = {
    "enabled": False,  # opt-in per workspace; voice is not on by default
    "require_confirmation": True,
    "tools": frozenset(ALLOWED_TOOLS),
    # en-AE is deliberately absent: Azure STT returns 400 for it (verified).
    # Gulf English users get en-GB; ar-AE is the real Emirati option.
    "locales": ("en-US", "en-GB", "ar-AE"),
    "max_session_minutes": 30,
    "max_concurrent_sessions": 1,
    "monthly_minutes_quota": 600,
    "monthly_spend_cap": 250.0,
}


@dataclass(frozen=True)
class Resolved:
    value: Any
    source: EScope


class PolicyViolation(Exception):
    """A scope tried to weaken something it does not own."""


@dataclass
class EffectivePolicy:
    values: dict[str, Resolved]

    def __getitem__(self, key: str) -> Any:
        return self.values[key].value

    def source_of(self, key: str) -> EScope:
        return self.values[key].source

    def explain(self) -> dict[str, str]:
        """Every value and where it came from — what an admin screen renders."""
        return {k: f"{r.value!r} (from {r.source.value})" for k, r in sorted(self.values.items())}


def resolve(overrides: dict[EScope, dict[str, Any]] | None = None) -> EffectivePolicy:
    """Deterministic: same overrides in, same policy out, with sources attached."""
    resolved = {k: Resolved(v, EScope.PLATFORM) for k, v in PLATFORM_DEFAULTS.items()}
    overrides = overrides or {}

    for scope in _PRECEDENCE[1:]:
        for key, value in (overrides.get(scope) or {}).items():
            if key not in resolved:
                raise PolicyViolation(f"unknown policy key {key!r}")
            _check_floor(key, value, resolved[key].value, scope)
            resolved[key] = Resolved(value, scope)
    return EffectivePolicy(values=resolved)


def _check_floor(key: str, proposed: Any, inherited: Any, scope: EScope) -> None:
    """Refuse a child scope that weakens a security floor. Stricter is fine."""
    if key not in _NON_OVERRIDABLE:
        return
    if key == "require_confirmation" and inherited and not proposed:
        raise PolicyViolation(f"{scope.value}: require_confirmation {_NON_OVERRIDABLE[key]}")
    if key == "tools" and not set(proposed) <= set(inherited):
        raise PolicyViolation(f"{scope.value}: tools {_NON_OVERRIDABLE[key]}")
    if key == "max_session_minutes" and proposed > inherited:
        raise PolicyViolation(f"{scope.value}: max_session_minutes {_NON_OVERRIDABLE[key]}")


# ── Quotas ───────────────────────────────────────────────────────────────────


@dataclass
class Usage:
    minutes: float = 0.0
    spend: float = 0.0


@dataclass(frozen=True)
class QuotaCheck:
    allowed: bool
    reason: str = ""
    #: Voice is a convenience layer over a working text UI, so exhausting a quota
    #: degrades rather than blocks. Losing the microphone is an inconvenience;
    #: losing the assistant is an outage.
    fallback_to_text: bool = False


def check_quota(policy: EffectivePolicy, usage: Usage) -> QuotaCheck:
    if usage.minutes >= policy["monthly_minutes_quota"]:
        return QuotaCheck(False, "monthly voice minutes exhausted", fallback_to_text=True)
    if usage.spend >= policy["monthly_spend_cap"]:
        return QuotaCheck(False, "monthly voice spend cap reached", fallback_to_text=True)
    return QuotaCheck(True)


# ── Kill switch ──────────────────────────────────────────────────────────────


@dataclass
class KillSwitch:
    """Stops new sessions. Live ones finish; audit access is never affected."""

    engaged: bool = False
    reason: str = ""
    at: datetime | None = None
    by: str = ""

    def engage(self, *, by: str, reason: str, now: datetime | None = None) -> None:
        self.engaged = True
        self.reason = reason
        self.by = by
        self.at = now or datetime.now(timezone.utc)

    def release(self) -> None:
        self.engaged = False
        self.reason = ""

    def blocks_new_session(self) -> bool:
        return self.engaged

    def blocks_existing_session(self) -> bool:
        """Always False. Tearing down live sessions strands half-confirmed
        drafts, which is a worse outcome than a few turns finishing."""
        return False

    def blocks_audit_access(self) -> bool:
        """Always False. An incident is exactly when the audit trail is needed."""
        return False


SWITCH = KillSwitch()


# ── Change history ───────────────────────────────────────────────────────────


@dataclass(frozen=True)
class PolicyChange:
    scope: EScope
    key: str
    before: Any
    after: Any
    actor_id: str
    at: datetime


@dataclass
class PolicyLog:
    entries: list[PolicyChange] = field(default_factory=list)

    def record(
        self,
        *,
        scope: EScope,
        key: str,
        before: Any,
        after: Any,
        actor_id: str,
        now: datetime | None = None,
    ) -> PolicyChange:
        entry = PolicyChange(
            scope=scope,
            key=key,
            before=before,
            after=after,
            actor_id=actor_id,
            at=now or datetime.now(timezone.utc),
        )
        self.entries.append(entry)
        return entry

    def for_key(self, key: str) -> list[PolicyChange]:
        return [e for e in self.entries if e.key == key]

    def clear(self) -> None:
        self.entries.clear()


CHANGES = PolicyLog()


def with_override(policy: EffectivePolicy, key: str, value: Any, scope: EScope) -> EffectivePolicy:
    """Apply one override to an already-resolved policy, floors still enforced."""
    _check_floor(key, value, policy[key], scope)
    updated = dict(policy.values)
    updated[key] = Resolved(value, scope)
    return replace(policy, values=updated)


# ── Pilot cohort (GIN-523) ───────────────────────────────────────────────────


@dataclass
class PilotCohort:
    """Explicit allowlist for a staged rollout.

    Membership is a list someone typed, never a percentage or a hash bucket. A
    percentage rollout expands on its own as the user base grows, which is
    exactly what "pilot cannot expand automatically" forbids — the point of a
    pilot is that widening it is a decision with a name attached.
    """

    workspace_slugs: frozenset[str] = field(default_factory=frozenset)
    exit_criteria_met: bool = False
    open_to_everyone: bool = False

    def admits(self, workspace_slug: str) -> bool:
        if self.open_to_everyone:
            return True
        return workspace_slug in self.workspace_slugs

    def widen(self, *, to: frozenset[str]) -> PilotCohort:
        """Growing the cohort requires the exit criteria to have been signed off."""
        if not self.exit_criteria_met:
            raise PolicyViolation(
                "pilot cannot expand until the exit criteria are recorded as met"
            )
        return PilotCohort(
            workspace_slugs=self.workspace_slugs | to,
            exit_criteria_met=self.exit_criteria_met,
        )

    def open_up(self) -> PilotCohort:
        if not self.exit_criteria_met:
            raise PolicyViolation("general availability requires the exit criteria to be met")
        return PilotCohort(workspace_slugs=self.workspace_slugs, exit_criteria_met=True, open_to_everyone=True)


COHORT = PilotCohort()


@dataclass(frozen=True)
class VoiceAvailability:
    """Whether voice may start, and what to do instead when it may not.

    `fallback_to_text` is True for every negative case on purpose: there is no
    condition under which losing voice should also cost the user the assistant.
    """

    available: bool
    reason: str = ""
    fallback_to_text: bool = True


def voice_available(
    policy: EffectivePolicy,
    *,
    workspace_slug: str,
    usage: Usage,
    switch: KillSwitch,
    cohort: PilotCohort,
) -> VoiceAvailability:
    """The single question the UI asks before offering a microphone."""
    if switch.blocks_new_session():
        return VoiceAvailability(False, f"voice is paused: {switch.reason}")
    if not policy["enabled"]:
        return VoiceAvailability(False, "voice is not enabled for this workspace")
    if not cohort.admits(workspace_slug):
        return VoiceAvailability(False, "workspace is not in the voice pilot")
    quota = check_quota(policy, usage)
    if not quota.allowed:
        return VoiceAvailability(False, quota.reason)
    return VoiceAvailability(True)
