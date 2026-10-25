"""Typed voice intent + work-item command schemas (GIN-505).

`parse_command` is the *only* door between a language model and a GigsNano tool.
Everything the model produces is untrusted text until it survives this module, so
the schemas are strict on purpose:

- unknown fields are rejected rather than ignored, because a silently dropped
  field is how "assign to Divya" becomes "assign to nobody";
- the requested tool must be on an allow-list, so a hallucinated
  `delete_everything` fails validation instead of reaching a dispatcher;
- risk class is derived here, not taken from the model — a model that could
  label its own action `read_only` could talk its way past confirmation.

A field the model could not fill is not simply absent. `EFieldState` separates
*missing* (never mentioned), *ambiguous* (several candidates), *invalid* (said,
but not a legal value) and *inaccessible* (real, but not this actor's to see).
They need different answers: ask, disambiguate, correct, and — for inaccessible —
say nothing that confirms the thing exists.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError

#: Bumped only for an incompatible change. A payload from a *newer* schema is
#: refused rather than best-effort parsed: the fields we would drop are exactly
#: the ones a newer producer added because they mattered.
COMMAND_SCHEMA_VERSION = 1


class EVoiceIntent(StrEnum):
    READ = "read"
    DRAFT = "draft"
    CREATE = "create"
    UPDATE = "update"
    COMMENT = "comment"
    CLARIFICATION = "clarification"
    CORRECTION = "correction"
    CANCEL = "cancel"
    UNSUPPORTED = "unsupported"


class ERiskClass(StrEnum):
    """The epic's execution policy, as a type."""

    READ_ONLY = "read_only"  # execute
    DRAFT = "draft"  # preview
    MATERIAL_WRITE = "material_write"  # explicit confirmation
    HIGH_RISK = "high_risk"  # block or hand off


class EFieldState(StrEnum):
    RESOLVED = "resolved"
    MISSING = "missing"
    AMBIGUOUS = "ambiguous"
    INVALID = "invalid"
    INACCESSIBLE = "inaccessible"


#: Derived from the intent, never read from model output.
_RISK_BY_INTENT: dict[EVoiceIntent, ERiskClass] = {
    EVoiceIntent.READ: ERiskClass.READ_ONLY,
    EVoiceIntent.CLARIFICATION: ERiskClass.READ_ONLY,
    EVoiceIntent.CANCEL: ERiskClass.READ_ONLY,
    EVoiceIntent.DRAFT: ERiskClass.DRAFT,
    EVoiceIntent.CORRECTION: ERiskClass.DRAFT,
    EVoiceIntent.CREATE: ERiskClass.MATERIAL_WRITE,
    EVoiceIntent.UPDATE: ERiskClass.MATERIAL_WRITE,
    EVoiceIntent.COMMENT: ERiskClass.MATERIAL_WRITE,
    EVoiceIntent.UNSUPPORTED: ERiskClass.HIGH_RISK,
}

#: The complete V1 tool surface reachable by voice. Deliberately far smaller than
#: the MCP tool list: deletion, bulk mutation and permission changes are out of V1
#: scope, so they must not be nameable, let alone callable.
ALLOWED_TOOLS: frozenset[str] = frozenset({
    "list_work_items",
    "search_work_items",
    "get_work_item",
    "get_work_item_context",
    "list_my_work_items",
    "list_projects",
    "create_work_item",
    "update_work_item",
    "add_comment",
    # Read-only additions (project_health bundle, Task 5): both are pure SELECTs
    # with no mutation path, so admitting them here only widens what a voice call
    # can *hear*, never what it can change. Without this the whole bundle was
    # reachable in text chat but silently invisible on a call — see
    # `agent/tools/bundles.py::_VOICE_RUNNER_TOOLS`.
    "project_health_summary",
    "list_open_blockers",
    # Read-only additions (spend_time bundle, Task 6): both are pure SELECTs
    # with no mutation path — same reasoning as the health-bundle pair above.
    # Without this a Finance agent has no spend tool exactly when someone rings
    # it up and asks what they've spent.
    "time_logged_summary",
    "ai_spend_summary",
})

#: Tools that mutate. A command naming one of these can never be READ_ONLY,
#: whatever its intent claims.
MUTATING_TOOLS: frozenset[str] = frozenset({
    "create_work_item",
    "update_work_item",
    "add_comment",
})

#: Fields each mutating action must have resolved before it may be confirmed.
REQUIRED_FIELDS: dict[EVoiceIntent, tuple[str, ...]] = {
    EVoiceIntent.CREATE: ("project", "title"),
    EVoiceIntent.UPDATE: ("code",),
    EVoiceIntent.COMMENT: ("code", "body"),
}


class Candidate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    label: str
    #: Why this candidate was offered — shown to the user when disambiguating,
    #: and the thing that makes a wrong resolution debuggable after the fact.
    evidence: str = ""
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class ResolvedField(BaseModel):
    model_config = ConfigDict(extra="forbid")

    state: EFieldState
    value: Any = None
    candidates: list[Candidate] = Field(default_factory=list)
    evidence: str = ""
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)

    @property
    def usable(self) -> bool:
        return self.state is EFieldState.RESOLVED and self.value is not None


class Clarification(BaseModel):
    """One focused question. Never a list of everything that went wrong — a voice
    interface that asks three questions at once gets three half-answers."""

    model_config = ConfigDict(extra="forbid")

    field: str
    question: str
    candidates: list[Candidate] = Field(default_factory=list)


class Blocked(BaseModel):
    """An intent we will not carry out. Explicit so the UI can say why rather than
    silently doing nothing."""

    model_config = ConfigDict(extra="forbid")

    reason: str
    risk: ERiskClass = ERiskClass.HIGH_RISK


class VoiceCommand(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int = COMMAND_SCHEMA_VERSION
    intent: EVoiceIntent
    tool: str | None = None
    fields: dict[str, ResolvedField] = Field(default_factory=dict)
    utterance: str = ""
    correlation_id: str = ""

    @property
    def risk(self) -> ERiskClass:
        """Derived, and biased upward: a mutating tool outranks a benign intent."""
        by_intent = _RISK_BY_INTENT[self.intent]
        if self.tool in MUTATING_TOOLS and by_intent in (
            ERiskClass.READ_ONLY,
            ERiskClass.DRAFT,
        ):
            return ERiskClass.MATERIAL_WRITE
        return by_intent

    def unresolved(self) -> list[str]:
        """Required fields that are not usable yet, in declaration order."""
        return [
            name
            for name in REQUIRED_FIELDS.get(self.intent, ())
            if not self.fields.get(name, ResolvedField(state=EFieldState.MISSING)).usable
        ]


class SchemaRejected(Exception):
    """Model output that is not a command. Never coerced into one."""


def parse_command(raw: dict) -> VoiceCommand:
    """Validate structured model output. Raises rather than repairing.

    Repair is the tempting behaviour here and the wrong one: a model that emits a
    field we do not recognise has understood the request differently than we do,
    and guessing which half to keep is how an unintended write happens.
    """
    if not isinstance(raw, dict):
        raise SchemaRejected("command must be an object")
    version = raw.get("version", COMMAND_SCHEMA_VERSION)
    if version != COMMAND_SCHEMA_VERSION:
        raise SchemaRejected(
            f"unsupported command schema version {version}; this build speaks "
            f"{COMMAND_SCHEMA_VERSION}"
        )
    try:
        command = VoiceCommand.model_validate(raw)
    except ValidationError as exc:
        raise SchemaRejected(str(exc)) from exc
    if command.tool is not None and command.tool not in ALLOWED_TOOLS:
        raise SchemaRejected(f"tool {command.tool!r} is not reachable by voice")
    return command


def triage(command: VoiceCommand) -> VoiceCommand | Clarification | Blocked:
    """Route a validated command to execution, one question, or a refusal.

    Every supported utterance lands in exactly one of these three — there is no
    fourth "just try it and see" branch, which is the point (AC1/AC2/AC3).
    """
    if command.intent is EVoiceIntent.UNSUPPORTED:
        return Blocked(reason="This is not something the voice assistant can do.")
    if command.risk is ERiskClass.HIGH_RISK:
        return Blocked(reason="Deletion, bulk changes and permissions are out of voice scope.")

    for name in command.unresolved():
        field = command.fields.get(name)
        if field is not None and field.state is EFieldState.AMBIGUOUS:
            return Clarification(
                field=name,
                question=f"Which {name} did you mean?",
                candidates=field.candidates,
            )
        if field is not None and field.state is EFieldState.INVALID:
            return Clarification(field=name, question=f"That {name} isn't valid — say it again?")
        # INACCESSIBLE is answered exactly like MISSING on purpose: confirming that
        # a project exists but is not yours leaks the org chart to anyone with a
        # microphone.
        return Clarification(field=name, question=f"Which {name}?")
    return command
