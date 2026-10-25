"""Resumable multimodal draft state machine (GIN-508).

One draft, whatever the user is typing or talking into. Voice and keyboard are
recorded as *provenance* on each field rather than as separate drafts, which is
what makes "say it, then fix the title with the keyboard" work without a merge
step that could lose one side.

The load-bearing rule is the confirmation seal. A confirmation authorises one
exact proposal, so it is stored as the version it was given against:

    confirm()  ->  confirmed_version = version
    any edit   ->  version += 1        (seal no longer matches)

Anything that changes the proposal therefore invalidates the approval that was
given for the old one. Re-asking is a small annoyance; executing a write the user
approved in a different shape is the failure this whole epic exists to prevent.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from gigsnano_api.voice.commands import EFieldState, ResolvedField

DRAFT_SCHEMA_VERSION = 1


class EModality(StrEnum):
    VOICE = "voice"
    TEXT = "text"


class EDraftStatus(StrEnum):
    OPEN = "open"
    CONFIRMED = "confirmed"
    ABANDONED = "abandoned"


class FieldProvenance(BaseModel):
    """Who set this field, how, and what it replaced. Kept because "the agent
    changed the assignee and I don't know when" is otherwise unanswerable."""

    model_config = ConfigDict(extra="forbid")

    modality: EModality
    at: datetime
    previous: Any = None


class Draft(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: int = DRAFT_SCHEMA_VERSION
    #: Bumps on every material change. The confirmation seal is compared to it.
    version: int = 1
    intent: str = "create"
    fields: dict[str, ResolvedField] = Field(default_factory=dict)
    provenance: dict[str, FieldProvenance] = Field(default_factory=dict)
    confirmed_version: int | None = None
    status: EDraftStatus = EDraftStatus.OPEN

    @property
    def confirmation_is_valid(self) -> bool:
        """True only while the approved proposal is still the current one."""
        return (
            self.status is EDraftStatus.CONFIRMED
            and self.confirmed_version == self.version
        )


class DraftClosed(Exception):
    """The draft was abandoned. Editing it would resurrect work the user dropped."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _mutable(draft: Draft) -> None:
    if draft.status is EDraftStatus.ABANDONED:
        raise DraftClosed("draft was abandoned")


def apply_correction(
    draft: Draft, field: str, value: ResolvedField, *, modality: EModality
) -> Draft:
    """Change exactly one field, recording what it replaced.

    Returns a new Draft rather than mutating: the previous version is what a
    reconnect may still be holding, and quietly editing it underneath would make
    "restore the last acknowledged draft" restore something the user never saw.
    """
    _mutable(draft)
    updated = draft.model_copy(deep=True)
    previous = draft.fields.get(field)
    updated.fields[field] = value
    updated.provenance[field] = FieldProvenance(
        modality=modality,
        at=_now(),
        previous=previous.value if previous else None,
    )
    updated.version += 1
    # An edit un-approves the proposal. Deliberately not "keep the approval if the
    # change looks cosmetic" — nobody can define cosmetic for someone else's write.
    updated.status = EDraftStatus.OPEN
    updated.confirmed_version = None
    return updated


def clear_field(draft: Draft, field: str, *, modality: EModality) -> Draft:
    """Explicitly drop a field — "no, not in that project". Distinct from never
    having said it only in the provenance trail."""
    return apply_correction(
        draft, field, ResolvedField(state=EFieldState.MISSING), modality=modality
    )


def confirm(draft: Draft) -> Draft:
    _mutable(draft)
    sealed = draft.model_copy(deep=True)
    sealed.status = EDraftStatus.CONFIRMED
    sealed.confirmed_version = sealed.version
    return sealed


def abandon(draft: Draft) -> Draft:
    dropped = draft.model_copy(deep=True)
    dropped.status = EDraftStatus.ABANDONED
    dropped.confirmed_version = None
    return dropped


def restore(payload: dict | None) -> Draft | None:
    """Rebuild an acknowledged draft after a reconnect.

    A payload from a newer schema is dropped rather than half-read: resuming a
    draft we do not fully understand is how a field silently reverts.
    """
    if not payload:
        return None
    if payload.get("schema_version", DRAFT_SCHEMA_VERSION) != DRAFT_SCHEMA_VERSION:
        return None
    draft = Draft.model_validate(payload)
    return None if draft.status is EDraftStatus.ABANDONED else draft
