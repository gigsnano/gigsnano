"""Voice session broker (GIN-502).

Two ideas carry the whole module:

**Acknowledged vs in-flight.** Only what the server has acknowledged — final
transcript lines and the current draft — survives a reconnect. Partial
transcript, queued synthesis audio and a confirmed-but-unfinished tool call are
*reported*, never replayed. Replaying any of them is how a voice agent puts words
in the user's mouth or files the same work item twice.

**Epoch.** Every session token carries the epoch it was minted in, and reconnect
bumps it. That is what makes reconnect "exactly once": the previous grant stops
working the moment a new one exists, so a double reconnect (or a captured token)
cannot leave two live clients driving one session.

Storage is process-local on purpose. Sessions live minutes, the API runs as a
single uvicorn process today, and a table for state this short-lived buys a
migration and a cleanup job for nothing.
ponytail: in-memory registry; move to Redis the day the API runs >1 worker,
otherwise a reconnect can land on a worker that has never seen the session.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

import jwt

from gigsnano_api.core.config import settings
from gigsnano_api.features.voice.write import Proposal
from gigsnano_api.voice.commands import VoiceCommand

logger = logging.getLogger("gigsnano.voice.session")

#: Short by design: the token is re-minted on every heartbeat and reconnect, so a
#: leaked one is worth little, and an abandoned tab stops costing provider time.
SESSION_TTL_MINUTES = 5


class SessionGone(Exception):
    """Expired, revoked, or superseded — the caller must start a new session."""


@dataclass
class VoiceSessionRecord:
    session_id: str
    actor_id: str
    workspace_slug: str
    locale: str
    agent_profile_version: int
    origin: str
    expires_at: datetime
    epoch: int = 1
    revoked: bool = False

    # Acknowledged state — the only thing reconnect restores.
    transcript: list[str] = field(default_factory=list)
    draft: dict[str, Any] | None = None

    # In-flight state — reported on reconnect, never replayed.
    partial: str = ""
    speaking: bool = False
    in_flight: dict[str, Any] | None = None

    #: The proposal last read aloud, awaiting confirmation, together with the
    #: command it was built from and the id of the agent whose registry it must
    #: be dispatched through. One at a time: a second proposal replaces the
    #: first, because a user who changed their mind mid-sentence must not be
    #: able to confirm the abandoned one. `agent_id` rides along because
    #: `VoiceCommand` doesn't carry it, and confirm must dispatch through the
    #: exact same agent's (bundles -> registry) the turn used.
    pending: tuple[Proposal, VoiceCommand, str] | None = None

    @property
    def alive(self) -> bool:
        return not self.revoked and self.expires_at > _now()


_SESSIONS: dict[str, VoiceSessionRecord] = {}


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Token issuance ───────────────────────────────────────────────────────────
#
# The browser receives THIS token and never a provider key. When a real adapter
# lands (GIN-500/501), the vendor credential is exchanged server-side inside the
# session's scope — a client that could mint vendor audio directly would bypass
# every RBAC, confirmation and audit control the epic exists to keep.


def issue_session_token(record: VoiceSessionRecord) -> str:
    payload = {
        "sub": record.actor_id,
        "sid": record.session_id,
        "ws": record.workspace_slug,
        "ver": record.agent_profile_version,
        "loc": record.locale,
        "origin": record.origin,
        "epoch": record.epoch,
        "aud": "voice",
        "type": "voice",
        "exp": record.expires_at,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_session_token(token: str) -> dict:
    return jwt.decode(
        token, settings.jwt_secret, algorithms=[settings.jwt_algorithm], audience="voice"
    )


def token_is_current(claims: dict) -> bool:
    """A token minted before the latest reconnect is spent, even if unexpired."""
    record = _SESSIONS.get(claims.get("sid", ""))
    return bool(record and record.alive and claims.get("epoch") == record.epoch)


# ── Lifecycle ────────────────────────────────────────────────────────────────


def start_session(
    *,
    actor_id: str,
    workspace_slug: str,
    locale: str,
    agent_profile_version: int,
    origin: str,
) -> tuple[VoiceSessionRecord, str]:
    _revoke_actors_other_sessions(actor_id, workspace_slug)
    record = VoiceSessionRecord(
        session_id=f"vs_{uuid4().hex[:16]}",
        actor_id=actor_id,
        workspace_slug=workspace_slug,
        locale=locale,
        agent_profile_version=agent_profile_version,
        origin=origin,
        expires_at=_now() + timedelta(minutes=SESSION_TTL_MINUTES),
    )
    _SESSIONS[record.session_id] = record
    _audit("start", record)
    return record, issue_session_token(record)


def _revoke_actors_other_sessions(actor_id: str, workspace_slug: str) -> None:
    """One live session per actor per workspace. Two would mean two microphones and
    two agents racing to mutate the same work item.

    ponytail: policy is hard-coded to single; the per-workspace override belongs
    to GIN-497, where every other voice policy knob is going.
    """
    for record in _SESSIONS.values():
        if record.actor_id == actor_id and record.workspace_slug == workspace_slug and record.alive:
            record.revoked = True
            _audit("superseded", record)


def require_live(session_id: str, actor_id: str) -> VoiceSessionRecord:
    """The single gate. Ownership is checked here rather than per-route so a new
    endpoint cannot forget it."""
    record = _SESSIONS.get(session_id)
    if record is None or record.actor_id != actor_id:
        raise KeyError(session_id)
    if not record.alive:
        raise SessionGone(session_id)
    return record


def heartbeat(
    record: VoiceSessionRecord,
    *,
    transcript_final: str | None = None,
    draft: dict[str, Any] | None = None,
) -> VoiceSessionRecord:
    """Keep-alive and acknowledgement in one call — the client is telling us where
    it got to, which is exactly when extending the lease is safe."""
    if transcript_final:
        record.transcript.append(transcript_final)
        record.partial = ""  # superseded by the final it corrects
    if draft is not None:
        record.draft = draft
    record.expires_at = _now() + timedelta(minutes=SESSION_TTL_MINUTES)
    _audit("heartbeat", record)
    return record


def reconnect(record: VoiceSessionRecord) -> tuple[dict[str, Any], str]:
    """Restore acknowledged state exactly once, and drop everything in flight."""
    record.epoch += 1
    record.expires_at = _now() + timedelta(minutes=SESSION_TTL_MINUTES)
    dropped_audio, record.speaking = record.speaking, False
    record.partial = ""
    state = {
        "session_id": record.session_id,
        "epoch": record.epoch,
        "transcript": list(record.transcript),
        "draft": record.draft,
        # A draft is a proposal. Coming back from a dropped connection must never
        # be the moment an unconfirmed write decides it was confirmed.
        "requires_confirmation": record.draft is not None and record.in_flight is None,
        "pending_audio_dropped": dropped_audio,
        "in_flight": record.in_flight,
        "expires_at": record.expires_at.isoformat(),
    }
    _audit("reconnect", record)
    return state, issue_session_token(record)


def end_session(record: VoiceSessionRecord) -> None:
    record.revoked = True
    _audit("end", record)


# ── Telemetry ────────────────────────────────────────────────────────────────


def _audit(action: str, record: VoiceSessionRecord) -> None:
    """One structured line per lifecycle transition. Carries the shape of the
    session and never its content — no transcript, no draft fields, no audio."""
    logger.info(
        "voice_session",
        extra={
            "voice": {
                "action": action,
                "session_id": record.session_id,
                "workspace": record.workspace_slug,
                "epoch": record.epoch,
                "profile_version": record.agent_profile_version,
                "alive": record.alive,
                "transcript_lines": len(record.transcript),
                "has_draft": record.draft is not None,
            }
        },
    )


# ── Test seams ───────────────────────────────────────────────────────────────
#
# Exposed rather than reaching into `_SESSIONS` from tests: the contract under
# test is the lifecycle, and a test that pokes the dict re-tests the dict.


def reset_sessions() -> None:
    _SESSIONS.clear()


def get(session_id: str) -> VoiceSessionRecord:
    return _SESSIONS[session_id]


def expire_now(session_id: str) -> None:
    _SESSIONS[session_id].expires_at = _now() - timedelta(seconds=1)


def nearly_expire(session_id: str) -> None:
    _SESSIONS[session_id].expires_at = _now() + timedelta(seconds=1)


def note_partial(session_id: str, text: str) -> None:
    _SESSIONS[session_id].partial = text


def note_speaking(session_id: str) -> None:
    _SESSIONS[session_id].speaking = True


def note_execution(session_id: str, *, idempotency_key: str) -> None:
    _SESSIONS[session_id].in_flight = {"idempotency_key": idempotency_key}
