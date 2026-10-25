"""Transcript redaction, action audit and retention (GIN-520).

Two jobs that pull in opposite directions, which is why they are one module.

**Operational logs must forget.** Spoken content is unusually candid — people say
things to a microphone they would not type into a ticket. Nothing here writes a
transcript, a draft value or audio into a log line; `redact` exists so that even
a well-meaning future caller passing a whole payload cannot leak one.

**The audit trail must remember.** A material write has to be provable after the
fact: what was proposed, what was approved, what actually happened. Those records
are content-bearing by necessity, so they live under retention policy and
authorised access rather than in the log stream.

The split is the point: deleting a user's transcripts must not delete the
evidence that a work item was created on their behalf.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

#: Default transcript retention. Workspace policy overrides it (GIN-497).
DEFAULT_TRANSCRIPT_RETENTION_DAYS = 30

#: Raw audio is never retained by default. Diagnostic sampling is a separate,
#: explicitly enabled path — not a flag flipped on this one.
RETAIN_RAW_AUDIO = False

#: Patterns scrubbed from anything that might reach a log. Deliberately blunt:
#: a false positive costs a redacted word, a false negative costs a credential.
_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\b[\w.%-]+@[\w.-]+\.[A-Za-z]{2,}\b"), "[email]"),
    (re.compile(r"\b(?:\d[ -]*?){13,19}\b"), "[card]"),
    (re.compile(r"\beyJ[\w-]+\.[\w-]+\.[\w-]+"), "[token]"),
    # Underscores must be inside the body, not just the prefix: real keys look
    # like sk_live_abcd1234, and a pattern that stops at the second underscore
    # leaves the secret half-printed, which is no better than printing it.
    (re.compile(r"\b(?:sk|pk|ghp|gho)_[A-Za-z0-9_]{8,}\b"), "[secret]"),
    (re.compile(r"\+\d[\d\s().-]{7,}\d"), "[phone]"),
)


def redact(text: str) -> str:
    """Scrub known secret and PII shapes. Applied to anything log-bound."""
    for pattern, replacement in _PATTERNS:
        text = pattern.sub(replacement, text)
    return text


def log_safe(**fields) -> dict:
    """Build a log payload that carries shape, not content.

    Values are reduced to their type and size unless explicitly whitelisted as
    non-content. A caller who passes the transcript by accident gets `str(214)`,
    not the transcript.
    """
    safe_keys = {
        "action", "outcome", "reason_code", "risk", "intent", "tool",
        "correlation_id", "session_id", "workspace", "actor_class",
        "proposal_hash", "idempotency_key", "duration_ms", "result_code",
    }
    out = {}
    for key, value in fields.items():
        if key in safe_keys:
            out[key] = redact(value) if isinstance(value, str) else value
        elif isinstance(value, str):
            out[key] = f"str({len(value)})"
        elif isinstance(value, (list, tuple, dict, set)):
            out[key] = f"{type(value).__name__}({len(value)})"
        elif isinstance(value, (bytes, bytearray)):
            out[key] = f"bytes({len(value)})"
        else:
            out[key] = type(value).__name__
    return out


@dataclass(frozen=True)
class ActionAudit:
    """Immutable proof of one material action.

    Content-bearing on purpose — `proposed` and `applied` are the whole point —
    which is why these are not log lines and why `purge_transcripts` leaves them
    alone.
    """

    correlation_id: str
    actor_id: str
    session_id: str
    action: str
    target_id: str | None
    proposal_hash: str
    proposed: dict
    policy_result: str
    confirmed: bool
    applied: dict | None
    outcome: str
    at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def proves(self, *, proposal_hash: str) -> bool:
        """Whether this record evidences that exact confirmed proposal."""
        return self.confirmed and self.proposal_hash == proposal_hash


@dataclass
class TranscriptRecord:
    session_id: str
    actor_id: str
    text: str
    at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class VoiceStore:
    """Transcripts and audits, with separate lifetimes.

    ponytail: in-memory, matching the rest of the voice layer. Audits are the one
    part of this feature that genuinely wants a table — they must outlive the
    process — so this is the seam GIN-497's admin work should replace first.
    """

    transcripts: list[TranscriptRecord] = field(default_factory=list)
    audits: list[ActionAudit] = field(default_factory=list)

    def add_transcript(self, record: TranscriptRecord) -> TranscriptRecord:
        self.transcripts.append(record)
        return record

    def add_audit(self, record: ActionAudit) -> ActionAudit:
        self.audits.append(record)
        return record

    def purge_transcripts(
        self,
        *,
        retention_days: int = DEFAULT_TRANSCRIPT_RETENTION_DAYS,
        now: datetime | None = None,
    ) -> int:
        """Expire transcripts past retention. Audits are untouched: erasing what
        someone said must not erase the record that a work item was created."""
        cutoff = (now or datetime.now(timezone.utc)) - timedelta(days=retention_days)
        before = len(self.transcripts)
        self.transcripts = [t for t in self.transcripts if t.at > cutoff]
        return before - len(self.transcripts)

    def delete_for_actor(self, actor_id: str) -> int:
        """Explicit user/admin deletion of an actor's transcripts.

        Same rule as expiry — the action audit survives, because it is evidence
        of a change to a shared backlog that other people depend on.
        """
        before = len(self.transcripts)
        self.transcripts = [t for t in self.transcripts if t.actor_id != actor_id]
        return before - len(self.transcripts)

    def clear(self) -> None:
        self.transcripts.clear()
        self.audits.clear()


STORE = VoiceStore()
