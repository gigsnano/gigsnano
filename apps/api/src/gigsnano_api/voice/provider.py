"""Voice provider seam. FakeVoiceProvider (keyless dev/tests) ↔ AzureSpeechProvider.
Mirrors the email/payments/agent-delegation seams.

Selection is by configuration, not by environment name: a key means Azure, no key
means the fake. So an environment without a Speech resource degrades to inert
rather than erroring, which is what keeps voice safe to deploy everywhere while
the pilot is limited to one workspace.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from uuid import uuid4

from gigsnano_api.core.config import settings
from gigsnano_api.voice.contracts import (
    VOICE_SCHEMA_VERSION,
    EVoiceEvent,
    SeqCounter,
    VoiceEvent,
    VoiceProvider,
    VoiceSessionConfig,
)

#: What the fake "hears". Scripted, never sampled — a flaky fake makes the whole
#: contract suite untrustworthy, and this one gates every future adapter.
FAKE_TRANSCRIPT = "how many tasks are pending"

#: Synthesis is chunked so callers exercise streaming; the count is fixed.
FAKE_SYNTHESIS_CHUNKS = 3


class FakeVoiceSession:
    """Deterministic in-memory session: no network, no sleeps, no randomness."""

    def __init__(self, config: VoiceSessionConfig) -> None:
        self.session_id = f"vs_{uuid4().hex[:16]}"
        self._config = config
        self._seq = SeqCounter()
        self._queue: list[VoiceEvent] = []
        self._speaking = False
        self._closed = False
        self._emit(EVoiceEvent.SESSION_STARTED)

    def _emit(self, kind: EVoiceEvent, **payload) -> None:
        self._queue.append(
            VoiceEvent(
                version=VOICE_SCHEMA_VERSION,
                seq=self._seq.next(),
                type=kind,
                session_id=self.session_id,
                correlation_id=self._config.correlation_id,
                **payload,
            )
        )

    async def send_audio(self, chunk: bytes) -> None:
        if self._closed or not chunk:
            return
        self._emit(EVoiceEvent.TURN_STARTED)
        head, _, tail = FAKE_TRANSCRIPT.rpartition(" ")
        self._emit(EVoiceEvent.TRANSCRIPT_PARTIAL, text=head)
        self._emit(EVoiceEvent.TRANSCRIPT_FINAL, text=f"{head} {tail}")
        self._emit(EVoiceEvent.TURN_ENDED)

    async def synthesize(self, text: str) -> None:
        if self._closed:
            return
        self._speaking = True
        self._emit(EVoiceEvent.SYNTHESIS_STARTED, text=text)
        for index in range(FAKE_SYNTHESIS_CHUNKS):
            if not self._speaking:  # interrupted or cancelled mid-stream
                return
            self._emit(EVoiceEvent.SYNTHESIS_CHUNK, audio=bytes([index]))
        self._emit(EVoiceEvent.SYNTHESIS_DONE)
        self._speaking = False

    async def interrupt(self) -> None:
        self._speaking = False
        self._emit(EVoiceEvent.INTERRUPTED)

    async def cancel(self) -> None:
        # Stopping is a local state flip, so the deadline is met by construction.
        # A real adapter sends the vendor's cancel and must return within
        # CANCEL_DEADLINE_SECONDS without waiting for the vendor to acknowledge.
        self._speaking = False
        self._drop_pending_synthesis()
        self._emit(EVoiceEvent.CANCELLED)

    def _drop_pending_synthesis(self) -> None:
        """Queued audio that has not reached the client is no longer wanted — the
        user is already talking over it."""
        self._queue = [
            e
            for e in self._queue
            if e.type not in (EVoiceEvent.SYNTHESIS_CHUNK, EVoiceEvent.SYNTHESIS_DONE)
        ]

    async def inject_error(self, code: str, *, retryable: bool = False) -> None:
        """Test seam: drive the ERROR path without a broken vendor to hand."""
        self._emit(EVoiceEvent.ERROR, error_code=code, retryable=retryable)

    async def end(self) -> None:
        if self._closed:
            return
        self._closed = True
        self._emit(EVoiceEvent.SESSION_ENDED)

    async def events(self) -> AsyncIterator[VoiceEvent]:
        """Drain what has been emitted so far, then close.

        A fake that waited for more would make every contract test depend on a
        timeout; the suite drives the session first and reads after.
        """
        pending, self._queue = self._queue, []
        for event in pending:
            yield event
        await asyncio.sleep(0)


class FakeVoiceProvider:
    async def start_session(self, config: VoiceSessionConfig) -> FakeVoiceSession:
        return FakeVoiceSession(config)


def build_default_voice_provider() -> VoiceProvider:
    if settings.azure_speech_key:
        from gigsnano_api.voice.provider_azure import AzureSpeechProvider

        return AzureSpeechProvider()
    return FakeVoiceProvider()
