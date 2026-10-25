"""Azure AI Speech adapter (GIN-501, unblocked by the GIN-524 benchmark).

Implements the canonical contracts in `contracts.py` against the REST surface the
benchmark already exercised end to end — so the calls here are the ones measured
at 695 ms p50, not a hopeful guess at an API shape.

Deliberately REST rather than the Speech SDK. The SDK bundles its own audio pump,
websocket layer and native binary; all three would sit between the runtime and the
latency we report, and it pulls a platform-specific dependency into a service that
currently has none.

**Batch, not streaming.** `send_audio` accepts a complete utterance and returns
one final transcript. That is honest about what it does: the ADR records that
neither topology emitted partials in the benchmark, and a streaming recogniser is
a separate piece of work. Consequently this adapter emits a TRANSCRIPT_PARTIAL
carrying the same text as the final rather than pretending to have streamed —
callers that render partials still work, they simply see one update instead of
several.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from uuid import uuid4

import httpx

from gigsnano_api.core.config import settings
from gigsnano_api.voice.contracts import (
    VOICE_SCHEMA_VERSION,
    EVoiceEvent,
    SeqCounter,
    VoiceEvent,
    VoiceSessionConfig,
)

#: Locales Azure STT actually accepts, verified against the live service rather
#: than taken from a docs table. `en-AE` looks plausible and returns 400 — there
#: is no Emirati English recognition model, only Arabic (`ar-AE`).
STT_LOCALES = frozenset({
    "en-US", "en-GB", "en-AU", "en-CA", "en-IN", "en-IE", "en-NZ", "en-ZA",
    "ar-AE", "ar-SA", "ar-EG", "fr-FR", "de-DE", "es-ES", "es-US", "hi-IN",
})

#: What to use when a caller asks for a locale the recogniser does not have.
#: en-AE -> en-GB rather than en-US: Gulf business English is far closer to
#: British spelling and vocabulary, and the mapping is visible here rather than
#: buried in a config file someone has to find.
LOCALE_FALLBACKS = {"en-AE": "en-GB", "en-BH": "en-GB", "en-QA": "en-GB", "en-SG": "en-GB"}


def resolve_locale(locale: str) -> str:
    """Map a requested locale onto one the recogniser supports.

    Silently substituting is the right call here: a user who picked "English
    (UAE)" wants English transcription, and failing the turn to make a point
    about model catalogues helps nobody. The substitution is logged by the
    caller's telemetry via the session's locale field.
    """
    if locale in STT_LOCALES:
        return locale
    if locale in LOCALE_FALLBACKS:
        return LOCALE_FALLBACKS[locale]
    # Fall back to the base language if we know a variant of it.
    base = locale.split("-")[0]
    for candidate in sorted(STT_LOCALES):
        if candidate.startswith(f"{base}-"):
            return candidate
    return "en-US"


#: One known-good neural voice per supported locale. A configured voice is used
#: only when it matches the resolved locale — `en-AE-FatimaNeural` is configured
#: in more than one place in this codebase and does not exist (the Emirati voice
#: is `ar-AE-FatimaNeural`), so trusting the config here would 400 every reply.
DEFAULT_VOICES = {
    "en-US": "en-US-AvaNeural",
    "en-GB": "en-GB-SoniaNeural",
    "en-IN": "en-IN-NeerjaNeural",
    "en-AU": "en-AU-NatashaNeural",
    "ar-AE": "ar-AE-FatimaNeural",
    "ar-SA": "ar-SA-ZariyahNeural",
    "fr-FR": "fr-FR-DeniseNeural",
    "de-DE": "de-DE-KatjaNeural",
    "es-ES": "es-ES-ElviraNeural",
    "hi-IN": "hi-IN-SwaraNeural",
}


def resolve_voice(configured: str, locale: str) -> str:
    """Pick a voice that actually belongs to the locale we will speak in."""
    if configured and configured.startswith(f"{locale}-"):
        return configured
    return DEFAULT_VOICES.get(locale, "en-US-AvaNeural")


#: Azure wants this exact container for the recogniser.
AUDIO_CONTENT_TYPE = "audio/wav; codecs=audio/pcm; samplerate=16000"

#: Long enough for a spoken sentence plus a slow network, short enough that a
#: wedged request cannot hold a voice turn open indefinitely.
REQUEST_TIMEOUT_SECONDS = 20.0


def _stt_url(region: str, locale: str) -> str:
    return (
        f"https://{region}.stt.speech.microsoft.com/speech/recognition"
        f"/conversation/cognitiveservices/v1?language={locale}"
    )


def _tts_url(region: str) -> str:
    return f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1"


class AzureSpeechSession:
    """One voice session over Azure Speech.

    Events are queued rather than pushed, matching `FakeVoiceSession`, so the
    contract suite drives both adapters identically — which is the whole point of
    GIN-501 and the reason this class needed no new test file.
    """

    def __init__(self, config: VoiceSessionConfig, *, key: str, region: str) -> None:
        self.session_id = f"vs_{uuid4().hex[:16]}"
        self._config = config
        self._key = key
        self._region = region
        self._seq = SeqCounter()
        self._queue: list[VoiceEvent] = []
        self._speaking = False
        self._closed = False
        self._cancelled = False
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

    def _fail(self, code: str, *, retryable: bool) -> None:
        """A provider failure is an ERROR event, never an exception.

        Raising here would unwind the caller and lose the transcript it was
        holding — the contract's whole position on vendor outages.
        """
        self._emit(EVoiceEvent.ERROR, error_code=code, retryable=retryable)

    async def send_audio(self, chunk: bytes) -> None:
        if self._closed or self._cancelled or not chunk:
            return
        self._emit(EVoiceEvent.TURN_STARTED)
        try:
            async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
                response = await client.post(
                    _stt_url(self._region, resolve_locale(self._config.locale)),
                    headers={
                        "Ocp-Apim-Subscription-Key": self._key,
                        "Content-Type": AUDIO_CONTENT_TYPE,
                        "Accept": "application/json",
                    },
                    content=chunk,
                )
        except httpx.TimeoutException:
            self._fail("provider_timeout", retryable=True)
            return
        except httpx.HTTPError:
            self._fail("provider_unavailable", retryable=True)
            return

        if response.status_code == 401:
            # Not retryable: retrying a bad key just burns the turn.
            self._fail("provider_unauthorized", retryable=False)
            return
        if response.status_code == 429:
            self._fail("provider_rate_limited", retryable=True)
            return
        if response.status_code >= 400:
            self._fail("provider_error", retryable=response.status_code >= 500)
            return

        body = response.json()
        text = body.get("DisplayText", "")
        if body.get("RecognitionStatus") == "NoMatch" or not text:
            # Silence or unintelligible audio is a normal outcome, not an error —
            # the turn simply ends with nothing said.
            self._emit(EVoiceEvent.TURN_ENDED)
            return

        # One update, not a stream. See the module docstring.
        self._emit(EVoiceEvent.TRANSCRIPT_PARTIAL, text=text)
        self._emit(EVoiceEvent.TRANSCRIPT_FINAL, text=text)
        self._emit(EVoiceEvent.TURN_ENDED)

    async def synthesize(self, text: str) -> None:
        if self._closed or self._cancelled or not text:
            return
        self._speaking = True
        self._emit(EVoiceEvent.SYNTHESIS_STARTED, text=text)
        locale = resolve_locale(self._config.locale)
        voice = resolve_voice(self._config.voice, locale)
        ssml = (
            f"<speak version='1.0' xml:lang='{locale}'>"
            f"<voice name='{voice}'>{_escape(text)}</voice></speak>"
        )
        try:
            async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
                response = await client.post(
                    _tts_url(self._region),
                    headers={
                        "Ocp-Apim-Subscription-Key": self._key,
                        "Content-Type": "application/ssml+xml",
                        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
                    },
                    content=ssml.encode("utf-8"),
                )
        except httpx.HTTPError:
            self._speaking = False
            self._fail("provider_unavailable", retryable=True)
            return

        if response.status_code >= 400:
            self._speaking = False
            self._fail("provider_error", retryable=response.status_code >= 500)
            return

        # Cancel may have landed while the request was in flight. Emitting the
        # audio now would talk over a user who already interrupted.
        if self._cancelled or not self._speaking:
            return
        self._emit(EVoiceEvent.SYNTHESIS_CHUNK, audio=response.content)
        self._emit(EVoiceEvent.SYNTHESIS_DONE)
        self._speaking = False

    async def interrupt(self) -> None:
        self._speaking = False
        self._emit(EVoiceEvent.INTERRUPTED)

    async def cancel(self) -> None:
        # Returns immediately without waiting on the vendor, which is what
        # CANCEL_DEADLINE_SECONDS requires: the deadline is measured against a
        # human already talking over the agent.
        self._cancelled = True
        self._speaking = False
        self._queue = [
            e
            for e in self._queue
            if e.type not in (EVoiceEvent.SYNTHESIS_CHUNK, EVoiceEvent.SYNTHESIS_DONE)
        ]
        self._emit(EVoiceEvent.CANCELLED)

    async def inject_error(self, code: str, *, retryable: bool = False) -> None:
        self._fail(code, retryable=retryable)

    async def end(self) -> None:
        if self._closed:
            return
        self._closed = True
        self._emit(EVoiceEvent.SESSION_ENDED)

    async def events(self) -> AsyncIterator[VoiceEvent]:
        pending, self._queue = self._queue, []
        for event in pending:
            yield event
        await asyncio.sleep(0)


def _escape(text: str) -> str:
    """SSML is XML. Unescaped user speech containing '&' breaks the request —
    and a transcript is exactly the place stray ampersands turn up."""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


class AzureSpeechProvider:
    def __init__(self, *, key: str | None = None, region: str | None = None) -> None:
        self._key = key or settings.azure_speech_key
        self._region = region or settings.azure_speech_region

    async def start_session(self, config: VoiceSessionConfig) -> AzureSpeechSession:
        return AzureSpeechSession(config, key=self._key, region=self._region)
