"""The versioned Voice Work Manager execution profile (GIN-514).

A profile pins *everything a session's behaviour depends on* — the tool
allow-list, the skills, the schema versions — into one publishable object, so
"why did it do that last Tuesday?" has an answer. A session records the profile
version it ran under; without that, a model or schema change silently rewrites
the history of every past session.

Publishing validates rather than trusts. A profile that names a skill nobody
implements, or pins a schema version this build cannot speak, fails to publish —
because the alternative is discovering it mid-utterance in front of a user.

Tools are deny-by-default: a profile lists what it may call, and anything outside
`ALLOWED_TOOLS` is refused at publish time. Widening the surface is therefore a
deliberate, reviewable act rather than a typo that happens to work.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum

from gigsnano_api.features.voice.draft import DRAFT_SCHEMA_VERSION
from gigsnano_api.voice.commands import ALLOWED_TOOLS, COMMAND_SCHEMA_VERSION
from gigsnano_api.voice.contracts import VOICE_SCHEMA_VERSION

PROFILE_NAME = "voice-work-manager"

#: The skills the epic's capability table requires. A published profile must bind
#: every one — a missing policy checker is not a degraded assistant, it is an
#: ungoverned one.
REQUIRED_SKILLS: frozenset[str] = frozenset({
    "voice_session_manager",
    "work_item_intent_router",
    "context_resolver",
    "work_item_draft_builder",
    "permission_policy_checker",
    "mutation_confirmation",
    "gigsnano_work_item_tools",
    "recovery_summarization",
})


class EProfileStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    DEPRECATED = "deprecated"
    ROLLED_BACK = "rolled_back"


class ProfileInvalid(Exception):
    """Refused at publish time, which is the only cheap time to refuse."""


@dataclass(frozen=True)
class SchemaPins:
    """Schema versions this profile was built and tested against.

    Pinned rather than read live: a profile published against command schema 1
    must not silently start speaking schema 2 because the process was redeployed.
    """

    voice: int = VOICE_SCHEMA_VERSION
    command: int = COMMAND_SCHEMA_VERSION
    draft: int = DRAFT_SCHEMA_VERSION


@dataclass
class VoiceProfile:
    version: int
    tools: frozenset[str] = field(default_factory=lambda: frozenset(ALLOWED_TOOLS))
    skills: frozenset[str] = field(default_factory=lambda: frozenset(REQUIRED_SKILLS))
    locales: tuple[str, ...] = ("en-US", "en-GB", "en-AE")
    pins: SchemaPins = field(default_factory=SchemaPins)
    status: EProfileStatus = EProfileStatus.DRAFT
    name: str = PROFILE_NAME

    def validate(self) -> None:
        missing = REQUIRED_SKILLS - self.skills
        if missing:
            raise ProfileInvalid(f"missing required skills: {sorted(missing)}")

        widened = self.tools - ALLOWED_TOOLS
        if widened:
            # Deny-by-default. A profile cannot grant itself a tool the voice
            # surface does not expose, whatever an admin types.
            raise ProfileInvalid(f"tools outside the voice surface: {sorted(widened)}")

        if not self.locales:
            raise ProfileInvalid("a profile must support at least one locale")

        live = SchemaPins()
        if (self.pins.voice, self.pins.command, self.pins.draft) != (
            live.voice, live.command, live.draft
        ):
            raise ProfileInvalid(
                f"pinned schemas {self.pins} are not what this build speaks ({live})"
            )


@dataclass
class ProfileRegistry:
    """Published versions, and which one new sessions get.

    ponytail: in-memory, like the rest of the voice layer. This is the piece with
    the strongest case for a table — profile history is an audit artefact — and
    is called out in the PR as such.
    """

    _versions: dict[int, VoiceProfile] = field(default_factory=dict)
    _active: int | None = None

    def publish(self, profile: VoiceProfile) -> VoiceProfile:
        profile.validate()
        profile.status = EProfileStatus.PUBLISHED
        for other in self._versions.values():
            if other.status is EProfileStatus.PUBLISHED:
                other.status = EProfileStatus.DEPRECATED
        self._versions[profile.version] = profile
        self._active = profile.version
        return profile

    def active(self) -> VoiceProfile | None:
        return self._versions.get(self._active) if self._active is not None else None

    def rollback(self, to_version: int) -> VoiceProfile:
        """Make a prior compatible version active again.

        Re-validated on the way back: a version that was fine when published may
        pin a schema this build no longer speaks, and rolling *into* a broken
        profile during an incident is the worst possible moment to find out.
        """
        target = self._versions.get(to_version)
        if target is None:
            raise ProfileInvalid(f"no such profile version: {to_version}")
        target.validate()
        current = self.active()
        if current is not None and current.version != to_version:
            current.status = EProfileStatus.ROLLED_BACK
        target.status = EProfileStatus.PUBLISHED
        self._active = to_version
        return target

    def clear(self) -> None:
        self._versions.clear()
        self._active = None


REGISTRY = ProfileRegistry()


@dataclass(frozen=True)
class SessionProfileStamp:
    """What a session records so its behaviour stays explicable later."""

    profile_name: str
    profile_version: int
    voice_schema: int
    command_schema: int
    draft_schema: int


def stamp(profile: VoiceProfile) -> SessionProfileStamp:
    return SessionProfileStamp(
        profile_name=profile.name,
        profile_version=profile.version,
        voice_schema=profile.pins.voice,
        command_schema=profile.pins.command,
        draft_schema=profile.pins.draft,
    )
