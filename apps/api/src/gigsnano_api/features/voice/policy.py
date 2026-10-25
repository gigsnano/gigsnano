"""The single policy gate every voice action passes (GIN-519).

One function — `enforce` — decides whether an action runs, and it **fails
closed**: an unknown risk class, a missing confirmation, a stale entity or an
unrecognised tool all deny. Adding a branch that returns "allow" by default is
the failure this shape exists to make hard.

Denials are deliberately vague to the caller and precise in the log. Telling a
user "you can't edit CHS-14, it belongs to the Payments project" confirms both
that CHS-14 exists and where it lives — to anyone with a microphone. The reason
code goes to telemetry; the spoken sentence does not.

Replay protection lives here too because it is the same decision: a nonce that
has already been spent is not a fresh authorisation, whatever else it carries.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from gigsnano_api.voice.commands import ALLOWED_TOOLS, ERiskClass, VoiceCommand

logger = logging.getLogger("gigsnano.voice.policy")

#: How long a nonce is remembered. Comfortably longer than a confirmation TTL, so
#: a replay cannot simply wait out the memory.
NONCE_TTL_SECONDS = 900


@dataclass(frozen=True)
class Decision:
    allowed: bool
    #: Machine-readable, for telemetry and tests. Never spoken.
    reason_code: str = ""
    #: What the user hears. Never names an object they may not see.
    spoken: str = ""


ALLOW = Decision(allowed=True)

#: One sentence per denial class. Uniformly unhelpful about object existence.
_SPOKEN = {
    "not_confirmed": "I need you to confirm that first.",
    "confirmation_stale": "That changed since you approved it — here it is again.",
    "risk_blocked": "That isn't something I can do by voice.",
    "unknown_tool": "That isn't something I can do by voice.",
    "no_access": "I couldn't find that, or it isn't yours to change.",
    "entity_stale": "Something moved while we were talking — let me redo that.",
    "replayed": "I've already handled that one.",
    "unknown_risk": "I'm not sure that's safe to do, so I've stopped.",
}


def spoken(code: str) -> str:
    """The uniformly unhelpful refusal copy for a reason code, for callers outside
    this module that need to say the same thing `_deny` would have said (e.g. a
    caller-side gate that runs before `enforce` and so never gets a `Decision`).
    Callers must use this rather than hand-typing copy that will silently drift
    from `_deny`'s."""
    return _SPOKEN.get(code, _SPOKEN["unknown_risk"])


def _deny(code: str) -> Decision:
    return Decision(allowed=False, reason_code=code, spoken=spoken(code))


def enforce(
    command: VoiceCommand,
    *,
    confirmed: bool,
    stale_fields: list[str] | None = None,
    accessible: bool = True,
) -> Decision:
    """Decide whether this action may execute, now.

    Order matters: access is checked before risk, so a denial for an object the
    actor cannot see never reveals *why* by taking a different branch.
    """
    if not accessible:
        return _deny("no_access")

    if command.tool is not None and command.tool not in ALLOWED_TOOLS:
        # parse_command already refuses these; re-checked because this gate must
        # hold on its own, not because the caller was careful.
        return _deny("unknown_tool")

    risk = command.risk
    if risk is ERiskClass.HIGH_RISK:
        return _deny("risk_blocked")

    if risk in (ERiskClass.READ_ONLY, ERiskClass.DRAFT):
        return ALLOW

    if risk is ERiskClass.MATERIAL_WRITE:
        if stale_fields:
            return _deny("entity_stale")
        if not confirmed:
            return _deny("not_confirmed")
        return ALLOW

    # Unreachable today. Kept because the alternative — falling through to allow
    # when someone adds a risk class — is the bug this whole module prevents.
    return _deny("unknown_risk")


def record(decision: Decision, command: VoiceCommand, *, correlation_id: str) -> Decision:
    """Log the precise reason the user was not told."""
    logger.info(
        "voice_policy",
        extra={
            "voice_policy": {
                "allowed": decision.allowed,
                "reason_code": decision.reason_code,
                "intent": command.intent.value,
                "risk": command.risk.value,
                "tool": command.tool,
                "correlation_id": correlation_id,
            }
        },
    )
    return decision


# ── Replay protection ────────────────────────────────────────────────────────


@dataclass
class NonceLedger:
    """Single-use tokens for confirmation and tool messages.

    ponytail: process-local, like the session broker and the idempotency ledger.
    All three move to Redis together when the API runs more than one worker —
    separately would leave a replay window on whichever one lagged.
    """

    _spent: dict[str, datetime] = field(default_factory=dict)

    def spend(self, nonce: str, *, now: datetime | None = None) -> bool:
        """True the first time, False forever after. Expired entries are dropped
        so the ledger cannot grow without bound across a long-lived process."""
        moment = now or datetime.now(timezone.utc)
        cutoff = moment - timedelta(seconds=NONCE_TTL_SECONDS)
        self._spent = {n: t for n, t in self._spent.items() if t > cutoff}
        if nonce in self._spent:
            return False
        self._spent[nonce] = moment
        return True

    def clear(self) -> None:
        self._spent.clear()


NONCES = NonceLedger()
