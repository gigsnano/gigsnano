"""Canonical voice contracts (GIN-501).

The agent runtime, the work-item skills and the session broker (GIN-502) import
from here and nowhere else. Nothing in this module names a vendor: swapping Azure
AI Speech for a realtime endpoint — the GIN-500 decision — must not reach
orchestration, so a vendor frame is translated at the adapter edge and never
carried through on the event.

Behaviour the adapters owe the runtime
--------------------------------------
Ordering    `seq` rises strictly per session. Gaps are legal (a dropped partial
            is corrected by the next final); regression is not, and `ordered()`
            raises rather than let stale transcript overwrite fresh transcript.
Versioning  Every event carries `version`. An adapter emitting a version this
            build does not know is refused — a half-understood realtime frame is
            more dangerous than a dead session, because it silently drops fields.
Timeouts    Callers impose them; adapters must not block indefinitely in
            `send_audio`/`synthesize`. A provider timeout arrives as an ERROR
            event with `retryable=True`, not as an exception mid-stream.
Retry       Only `retryable` errors may be retried, and only by the caller — an
            adapter must never silently re-send audio, which duplicates turns.
Backpressure `send_audio` is awaited, so a slow provider naturally throttles the
            capture loop. Adapters must not buffer audio without bound; drop the
            oldest frames and report an ERROR instead of growing memory.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from enum import StrEnum
from typing import Protocol, runtime_checkable

#: Bumped when the event shape changes incompatibly. `ordered()` refuses anything else.
VOICE_SCHEMA_VERSION = 1

#: How long `cancel()` may take to stop synthesis and turn execution (AC5). Short
#: because it is measured against a human who has started talking over the agent.
CANCEL_DEADLINE_SECONDS = 0.25


class EVoiceEvent(StrEnum):
    SESSION_STARTED = "session_started"
    TURN_STARTED = "turn_started"
    TRANSCRIPT_PARTIAL = "transcript_partial"
    TRANSCRIPT_FINAL = "transcript_final"
    TURN_ENDED = "turn_ended"
    SYNTHESIS_STARTED = "synthesis_started"
    SYNTHESIS_CHUNK = "synthesis_chunk"
    SYNTHESIS_DONE = "synthesis_done"
    INTERRUPTED = "interrupted"
    CANCELLED = "cancelled"
    ERROR = "error"
    SESSION_ENDED = "session_ended"


@dataclass(frozen=True)
class VoiceSessionConfig:
    """What the broker (GIN-502) binds a session to before any audio flows."""

    actor_id: str
    workspace_slug: str
    correlation_id: str
    locale: str = "en-US"
    voice: str = ""
    agent_profile_version: int = 1


@dataclass(frozen=True)
class VoiceEvent:
    """The only shape the runtime sees. Deliberately one flat record rather than a
    union: every consumer already switches on `type`, and a closed field set is
    what `test_canonical_events_expose_no_provider_payload` can actually police."""

    version: int
    seq: int
    type: EVoiceEvent
    session_id: str
    correlation_id: str
    text: str = ""
    audio: bytes = b""
    error_code: str = ""
    retryable: bool = False


class VoiceProtocolError(Exception):
    """The stream broke its own contract — wrong version, or ordering regression.

    Vendor *failures* are not exceptions: they arrive as an ERROR event carrying
    `error_code` + `retryable`, so a mid-turn provider outage never unwinds the
    caller's stack and loses the transcript it was holding.
    """


async def ordered(events: AsyncIterator[VoiceEvent]) -> AsyncIterator[VoiceEvent]:
    """Wrap any adapter's stream so invalid or out-of-order events fail safely (AC4).

    Every consumer goes through this, so no adapter has to be trusted to police
    itself — which is the point, since the untrusted one is whichever vendor SDK
    we adopt next.
    """
    last = -1
    async for event in events:
        if event.version != VOICE_SCHEMA_VERSION:
            raise VoiceProtocolError(
                f"unsupported schema version {event.version}; this build speaks "
                f"{VOICE_SCHEMA_VERSION}"
            )
        if event.seq <= last:
            raise VoiceProtocolError(f"event {event.seq} arrived out of order after {last}")
        last = event.seq
        yield event


@runtime_checkable
class VoiceSession(Protocol):
    session_id: str

    async def send_audio(self, chunk: bytes) -> None: ...

    async def synthesize(self, text: str) -> None: ...

    async def interrupt(self) -> None: ...

    async def cancel(self) -> None: ...

    async def end(self) -> None: ...

    def events(self) -> AsyncIterator[VoiceEvent]: ...


@runtime_checkable
class VoiceProvider(Protocol):
    async def start_session(self, config: VoiceSessionConfig) -> VoiceSession: ...


@dataclass
class SeqCounter:
    """Per-session sequence counter. One instance per session so `seq` is one
    series across transcript, synthesis and lifecycle events — `ordered()` rejects
    the stream otherwise."""

    value: int = 0

    def next(self) -> int:
        self.value += 1
        return self.value
