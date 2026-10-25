"""Governed voice writes: typed drafts, confirmation binding, idempotency,
optimistic concurrency (GIN-496).

The epic's hardest requirement lands here — *100% of material writes show the
exact target and delta before execution* — so this module is built around one
idea: **a confirmation authorises exactly one proposal, and nothing else.**

That is enforced by a proposal hash rather than a flag. The hash covers every
field that would be written, so "yes" can only ever authorise the bytes the user
was just shown. Change a field, the hash changes, and the confirmation stops
matching. There is no path where an approval survives an edit.

Idempotency derives from the same hash. A retry after a dropped connection
recomputes an identical key and reconciles against what already exists, so the
duplicate-work-item bug — the one that makes a voice assistant untrustworthy —
cannot happen even if the client gives up and asks again.

Field provenance is carried alongside every value: `SPOKEN`, `CONTEXT`, `DEFAULT`
or `GENERATED`. A user confirming a due date they never said is the quiet failure
mode of a drafting agent, and the only defence is showing which parts it made up.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import StrEnum
from typing import Any

#: How long a confirmation stays valid once shown. Long enough to read a preview
#: aloud and answer, short enough that the world has not moved underneath it.
CONFIRMATION_TTL_SECONDS = 180

#: Fields a create proposal may carry. Anything else is not writable by voice.
#:
#: Exactly `agent/tools/work_items.py::CREATE_WORK_ITEM_SCHEMA`'s properties, and
#: that is the whole point: `apply_proposal` hands `Proposal.payload` to the tool
#: as-is, and the tool takes what it recognises. A name here the tool does not
#: accept is a field spoken aloud, confirmed by the user, silently dropped — with
#: a receipt that says `applied`. Making it unproposable is the only place that
#: cannot be forgotten; `tests/test_agent_bundles.py` asserts the two stay in step.
CREATE_FIELDS = (
    "project", "title", "type", "description", "priority", "parent",
)

REQUIRED_CREATE_FIELDS = ("project", "title")

#: Updatable by voice. Deletion, re-parenting to another project, bulk changes
#: and permission fields are absent by design, not by oversight.
UPDATABLE_FIELDS = ("title", "status", "priority", "assignee", "target_date", "start_date")


class ESource(StrEnum):
    SPOKEN = "spoken"  # the user said it
    CONTEXT = "context"  # taken from the open project / current session
    DEFAULT = "default"  # a project default
    GENERATED = "generated"  # the agent wrote it


@dataclass(frozen=True)
class Sourced:
    value: Any
    source: ESource

    @property
    def is_inferred(self) -> bool:
        return self.source in (ESource.DEFAULT, ESource.GENERATED)


class ProposalRejected(Exception):
    """The proposal cannot be previewed, let alone executed."""


class ConfirmationExpired(Exception):
    """The approval no longer matches the proposal, or has aged out."""


class StaleWrite(Exception):
    """The target changed since it was read. Never resolved by overwriting."""

    def __init__(self, changed: dict[str, tuple[Any, Any]]):
        super().__init__(f"item changed underneath: {sorted(changed)}")
        self.changed = changed


@dataclass
class Proposal:
    """A complete, previewable write. Immutable once hashed."""

    action: str  # "create" | "update" | "comment"
    fields: dict[str, Sourced] = field(default_factory=dict)
    target_id: str | None = None
    #: The version of the target this proposal was built against, for updates.
    expected_updated_at: datetime | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def payload(self) -> dict[str, Any]:
        """Exactly what would be written — and exactly what gets hashed."""
        return {name: sourced.value for name, sourced in sorted(self.fields.items())}

    @property
    def hash(self) -> str:
        """Covers the action, the target and every value.

        Not the provenance: re-deriving a title the agent had generated, from the
        same words the user later spoke, is the same write and should not
        invalidate an approval the user already gave for that exact text.
        """
        material = {
            "action": self.action,
            "target_id": self.target_id,
            "payload": self.payload,
        }
        encoded = json.dumps(material, sort_keys=True, default=str).encode()
        return hashlib.sha256(encoded).hexdigest()[:32]

    @property
    def inferred_fields(self) -> list[str]:
        """What the agent supplied rather than heard. Read aloud before confirming."""
        return sorted(name for name, s in self.fields.items() if s.is_inferred)

    def idempotency_key(self, *, session_id: str) -> str:
        """Stable across retries of the same confirmed proposal in one session.

        Session-scoped on purpose: the same user deliberately filing the same bug
        twice from two sessions is two bugs, but a dropped connection inside one
        session is one.
        """
        return f"voice_{session_id}_{self.hash}"


def build_create(fields: dict[str, Sourced]) -> Proposal:
    """Validate a create draft. Raises rather than previewing something unwritable."""
    unknown = set(fields) - set(CREATE_FIELDS)
    if unknown:
        raise ProposalRejected(f"not writable by voice: {sorted(unknown)}")
    missing = [f for f in REQUIRED_CREATE_FIELDS if f not in fields or fields[f].value in (None, "")]
    if missing:
        # AC: no create tool is called while required fields are missing. Making
        # this unrepresentable beats remembering to check at the call site.
        raise ProposalRejected(f"missing required fields: {missing}")
    return Proposal(action="create", fields=dict(fields))


def build_update(
    target_id: str, current: dict[str, Any], changes: dict[str, Sourced], *, updated_at: datetime
) -> Proposal:
    unknown = set(changes) - set(UPDATABLE_FIELDS)
    if unknown:
        raise ProposalRejected(f"not updatable by voice: {sorted(unknown)}")
    effective = {k: v for k, v in changes.items() if current.get(k) != v.value}
    if not effective:
        raise ProposalRejected("nothing would change")
    return Proposal(
        action="update",
        fields=effective,
        target_id=target_id,
        expected_updated_at=updated_at,
    )


def delta(current: dict[str, Any], proposal: Proposal) -> dict[str, tuple[Any, Any]]:
    """before -> after, for the preview. The thing the user actually approves."""
    return {
        name: (current.get(name), sourced.value)
        for name, sourced in sorted(proposal.fields.items())
    }


# ── Confirmation binding ─────────────────────────────────────────────────────


@dataclass(frozen=True)
class Confirmation:
    """An approval bound to one proposal, one actor and one session.

    All four bindings matter: the hash stops it authorising a different write,
    the actor stops one user's "yes" arming another's draft, the session ties it
    to a live authenticated context, and the expiry stops an approval given
    before lunch executing after it.
    """

    proposal_hash: str
    actor_id: str
    session_id: str
    at: datetime

    def check(self, proposal: Proposal, *, actor_id: str, session_id: str, now: datetime) -> None:
        if self.proposal_hash != proposal.hash:
            raise ConfirmationExpired("the proposal changed after it was confirmed")
        if self.actor_id != actor_id or self.session_id != session_id:
            raise ConfirmationExpired("confirmation belongs to a different actor or session")
        if (now - self.at).total_seconds() > CONFIRMATION_TTL_SECONDS:
            raise ConfirmationExpired("confirmation expired")


def confirm(proposal: Proposal, *, actor_id: str, session_id: str, now: datetime | None = None) -> Confirmation:
    return Confirmation(
        proposal_hash=proposal.hash,
        actor_id=actor_id,
        session_id=session_id,
        at=now or datetime.now(timezone.utc),
    )


def authorise(
    proposal: Proposal,
    confirmation: Confirmation | None,
    *,
    actor_id: str,
    session_id: str,
    now: datetime | None = None,
) -> None:
    """The gate every material write passes. No confirmation is not a warning."""
    if confirmation is None:
        raise ConfirmationExpired("this write has not been confirmed")
    confirmation.check(
        proposal, actor_id=actor_id, session_id=session_id, now=now or datetime.now(timezone.utc)
    )


# ── Optimistic concurrency ───────────────────────────────────────────────────


def check_not_stale(proposal: Proposal, live_updated_at: datetime | None) -> None:
    """Refuse an update built against an older version of the item.

    A voice update is proposed, spoken aloud, and confirmed — seconds in which a
    teammate can move the same item. Overwriting them silently is the outcome
    this raises to prevent; the caller rebuilds the proposal against the new state.
    """
    if proposal.expected_updated_at is None or live_updated_at is None:
        return
    if live_updated_at > proposal.expected_updated_at:
        raise StaleWrite({"updated_at": (proposal.expected_updated_at, live_updated_at)})


# ── Execution receipts ───────────────────────────────────────────────────────


@dataclass
class Receipt:
    """Links the confirmed proposal to what actually happened. The audit record."""

    action: str
    proposal_hash: str
    idempotency_key: str
    correlation_id: str
    result_id: str | None = None
    #: An actual work-item code (e.g. "APO-12"), when the tool surfaced one.
    #: Never a URL -- that's `result_url`. Names must mean what they say.
    result_code: str | None = None
    #: The deep link to what the write touched, from `ToolResult.link`.
    result_url: str | None = None
    outcome: str = "applied"  # applied | deduplicated | failed
    detail: str = ""


@dataclass
class _Executed:
    receipt: Receipt
    at: datetime


class IdempotencyLedger:
    """Remembers what each key already produced.

    ponytail: process-local, matching the session broker — a voice confirmation
    and its retry live inside one short session on one worker. Moves to Redis with
    the broker, and for the same reason.
    """

    def __init__(self) -> None:
        self._seen: dict[str, _Executed] = {}

    def replay(self, key: str) -> Receipt | None:
        """The already-created item, if this exact write already happened."""
        prior = self._seen.get(key)
        if prior is None:
            return None
        replayed = Receipt(**vars(prior.receipt))
        replayed.outcome = "deduplicated"
        replayed.detail = "this exact write already completed"
        return replayed

    def record(self, key: str, receipt: Receipt, *, now: datetime | None = None) -> Receipt:
        self._seen[key] = _Executed(receipt=receipt, at=now or datetime.now(timezone.utc))
        return receipt

    def clear(self) -> None:
        self._seen.clear()


#: One ledger per process, mirroring the session registry.
LEDGER = IdempotencyLedger()
