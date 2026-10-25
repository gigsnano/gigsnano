"""The one contract suite every voice adapter must pass (GIN-501).

Parameterised over `ADAPTERS` deliberately: when the GIN-500 topology decision
lands and a real Azure adapter arrives, it is added to that list and inherits
every assertion here — which is what AC3 ("fake and Azure adapters pass the same
contract suite") actually asks for. A provider that needs its own test file has
leaked provider behaviour into the contract.
"""

import asyncio
from dataclasses import fields

import pytest

from gigsnano_api.voice.contracts import (
    CANCEL_DEADLINE_SECONDS,
    VOICE_SCHEMA_VERSION,
    EVoiceEvent,
    VoiceEvent,
    VoiceProtocolError,
    VoiceSessionConfig,
    ordered,
)
from gigsnano_api.voice.provider import FakeVoiceProvider

def _azure_or_skip():
    """The real adapter, when a Speech key is configured.

    Included in the same suite rather than given its own file: an adapter that
    needs bespoke tests has leaked provider behaviour into the contract, which is
    precisely what GIN-501 exists to prevent.
    """
    from gigsnano_api.core.config import settings

    if not settings.azure_speech_key:
        return pytest.param(
            None, marks=pytest.mark.skip(reason="no AZURE_SPEECH_KEY configured")
        )
    from gigsnano_api.voice.provider_azure import AzureSpeechProvider

    return AzureSpeechProvider


#: Every adapter under contract. Append new adapters here, not a new file.
ADAPTERS = [FakeVoiceProvider, _azure_or_skip()]

CONFIG = VoiceSessionConfig(
    actor_id="user-1",
    workspace_slug="acme",
    correlation_id="corr-1",
    locale="en-AE",
    voice="en-AE-FatimaNeural",
    agent_profile_version=1,
)


@pytest.fixture(params=ADAPTERS, ids=lambda a: getattr(a, "__name__", "azure"))
def provider(request):
    return request.param()


@pytest.fixture(scope="session")
def speech():
    """Real 16kHz speech saying "how many tasks are pending".

    The fake would accept any bytes, but a real recogniser will not — and a
    contract suite that only ever feeds one adapter valid input is not testing
    the contract, it is testing the fake. Committed rather than synthesised per
    run so the suite stays offline and deterministic.
    """
    from pathlib import Path

    return Path(__file__).parent.joinpath("fixtures/utterance-16k.wav").read_bytes()


async def drain(session, limit: int = 50) -> list[VoiceEvent]:
    """Collect canonical events until the session closes its stream."""
    out: list[VoiceEvent] = []
    async for event in ordered(session.events()):
        out.append(event)
        if len(out) >= limit or event.type is EVoiceEvent.SESSION_ENDED:
            break
    return out


@pytest.mark.asyncio
async def test_session_start_announces_itself(provider):
    session = await provider.start_session(CONFIG)
    events = await drain(session)
    first = events[0]
    assert first.type is EVoiceEvent.SESSION_STARTED
    assert first.version == VOICE_SCHEMA_VERSION
    assert first.session_id == session.session_id


@pytest.mark.asyncio
async def test_audio_yields_partial_then_final_transcript(provider, speech):
    session = await provider.start_session(CONFIG)
    await session.send_audio(speech)
    events = await drain(session)
    kinds = [e.type for e in events]
    assert EVoiceEvent.TRANSCRIPT_PARTIAL in kinds
    assert EVoiceEvent.TRANSCRIPT_FINAL in kinds
    # A partial that arrives after the final would let the UI regress its caption.
    assert kinds.index(EVoiceEvent.TRANSCRIPT_PARTIAL) < kinds.index(EVoiceEvent.TRANSCRIPT_FINAL)
    final = next(e for e in events if e.type is EVoiceEvent.TRANSCRIPT_FINAL)
    assert final.text


@pytest.mark.asyncio
async def test_turn_detection_brackets_the_utterance(provider, speech):
    session = await provider.start_session(CONFIG)
    await session.send_audio(speech)
    kinds = [e.type for e in await drain(session)]
    assert kinds.index(EVoiceEvent.TURN_STARTED) < kinds.index(EVoiceEvent.TURN_ENDED)


@pytest.mark.asyncio
async def test_every_event_carries_session_and_correlation_ids(provider, speech):
    session = await provider.start_session(CONFIG)
    await session.send_audio(speech)
    for event in await drain(session):
        assert event.session_id == session.session_id
        assert event.correlation_id == CONFIG.correlation_id


@pytest.mark.asyncio
async def test_canonical_events_expose_no_provider_payload(provider, speech):
    """AC2: a raw vendor frame must not ride along on the event."""
    session = await provider.start_session(CONFIG)
    await session.send_audio(speech)
    allowed = {f.name for f in fields(VoiceEvent)}
    for event in await drain(session):
        assert set(vars(event)) <= allowed


@pytest.mark.asyncio
async def test_synthesis_streams_then_completes(provider):
    session = await provider.start_session(CONFIG)
    await session.synthesize("Three items are pending.")
    kinds = [e.type for e in await drain(session)]
    assert kinds.count(EVoiceEvent.SYNTHESIS_CHUNK) >= 1
    assert kinds.index(EVoiceEvent.SYNTHESIS_STARTED) < kinds.index(EVoiceEvent.SYNTHESIS_DONE)


@pytest.mark.asyncio
async def test_cancel_stops_synthesis_within_the_agreed_bound(provider):
    """AC5. The bound is the contract — a provider that keeps talking over the
    user after cancel is the failure this test exists to catch."""
    session = await provider.start_session(CONFIG)
    await session.synthesize("A very long spoken answer that must stop early.")
    started = asyncio.get_running_loop().time()
    await session.cancel()
    elapsed = asyncio.get_running_loop().time() - started
    assert elapsed <= CANCEL_DEADLINE_SECONDS

    kinds = [e.type for e in await drain(session)]
    assert EVoiceEvent.CANCELLED in kinds
    tail = kinds[kinds.index(EVoiceEvent.CANCELLED) :]
    assert EVoiceEvent.SYNTHESIS_CHUNK not in tail
    assert EVoiceEvent.SYNTHESIS_DONE not in tail


@pytest.mark.asyncio
async def test_interrupt_ends_the_turn(provider):
    session = await provider.start_session(CONFIG)
    await session.synthesize("Long answer")
    await session.interrupt()
    assert EVoiceEvent.INTERRUPTED in [e.type for e in await drain(session)]


@pytest.mark.asyncio
async def test_provider_error_surfaces_as_a_canonical_event(provider):
    session = await provider.start_session(CONFIG)
    await session.inject_error("provider_unavailable", retryable=True)
    error = next(e for e in await drain(session) if e.type is EVoiceEvent.ERROR)
    assert error.error_code == "provider_unavailable"
    assert error.retryable is True


# ── Stream validation: these police the wrapper, not any one adapter ──────────


def event(seq: int, *, version: int = VOICE_SCHEMA_VERSION) -> VoiceEvent:
    return VoiceEvent(
        version=version,
        seq=seq,
        type=EVoiceEvent.TRANSCRIPT_PARTIAL,
        session_id="s-1",
        correlation_id="corr-1",
        text="hi",
    )


async def stream(*events):
    for item in events:
        yield item


@pytest.mark.asyncio
async def test_out_of_order_events_fail_loudly():
    """AC4. Silently accepting a seq regression replays stale transcript over
    fresh transcript — worse than refusing the stream."""
    with pytest.raises(VoiceProtocolError, match="out of order"):
        async for _ in ordered(stream(event(1), event(3), event(2))):
            pass


@pytest.mark.asyncio
async def test_duplicate_sequence_numbers_fail():
    with pytest.raises(VoiceProtocolError, match="out of order"):
        async for _ in ordered(stream(event(1), event(1))):
            pass


@pytest.mark.asyncio
async def test_unknown_schema_version_fails():
    with pytest.raises(VoiceProtocolError, match="schema version"):
        async for _ in ordered(stream(event(1, version=VOICE_SCHEMA_VERSION + 1))):
            pass


def test_the_canonical_layer_names_no_vendor():
    """AC1/AC2 rot silently: the day someone imports an Azure SDK into contracts.py
    to reuse one enum, orchestration is coupled to a vendor and no other test
    notices. The adapter edge is provider.py and its future siblings."""
    import ast
    from pathlib import Path

    from gigsnano_api.voice import contracts as canonical

    tree = ast.parse(Path(canonical.__file__).read_text(encoding="utf-8"))
    imported = {
        alias.name
        for node in ast.walk(tree)
        if isinstance(node, ast.Import)
        for alias in node.names
    } | {
        node.module
        for node in ast.walk(tree)
        if isinstance(node, ast.ImportFrom) and node.module
    }
    for vendor in ("azure", "openai", "speechsdk", "deepgram", "elevenlabs"):
        leaked = [name for name in imported if vendor in name.lower()]
        assert not leaked, f"{vendor} leaked into the canonical layer via {leaked}"


@pytest.mark.asyncio
async def test_gaps_are_allowed_because_transports_drop_partials():
    """A dropped *partial* is recoverable — the next final corrects the caption.
    Only regression is fatal, so `ordered` must not demand a contiguous run."""
    got = [e.seq async for e in ordered(stream(event(1), event(5)))]
    assert got == [1, 5]
