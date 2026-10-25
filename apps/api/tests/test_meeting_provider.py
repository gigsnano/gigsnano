import json
from urllib.parse import quote

import httpx
import pytest

from gigsnano_api.meetings.provider import (
    FakeMeetingBotProvider,
    MeetingBotError,
    VexaMeetingBotProvider,
)
from gigsnano_api.models.meetings import EMeetingPlatform as P
from gigsnano_api.models.meetings import EMeetingStatus as S


async def test_fake_walks_join_admission_call_end():
    fake = FakeMeetingBotProvider(script=[("Ada", "Hello"), ("Alan", "Hi")])
    await fake.start_bot(platform=P.GOOGLE_MEET, native_meeting_id="abc", passcode=None, bot_name="x")
    seen = [await fake.get_state(platform=P.GOOGLE_MEET, native_meeting_id="abc") for _ in range(5)]
    assert [s.status for s in seen] == [S.JOINING, S.WAITING_ADMISSION, S.IN_CALL, S.IN_CALL, S.ENDED]
    assert [seg.text for seg in seen[3].segments] == ["Hello", "Hi"]


async def test_fake_stop_ends_with_segments_so_far():
    fake = FakeMeetingBotProvider(script=[("Ada", "Hello"), ("Alan", "Hi")])
    await fake.start_bot(platform=P.ZOOM, native_meeting_id="1", passcode=None, bot_name="x")
    for _ in range(3):
        await fake.get_state(platform=P.ZOOM, native_meeting_id="1")
    await fake.stop_bot(platform=P.ZOOM, native_meeting_id="1")
    state = await fake.get_state(platform=P.ZOOM, native_meeting_id="1")
    assert state.status is S.ENDED and len(state.segments) == 1


def _vexa(handler):
    return VexaMeetingBotProvider("http://vexa", "key", transport=httpx.MockTransport(handler))


async def test_vexa_start_posts_bot_with_api_key():
    seen = {}

    def handler(request):
        seen["key"] = request.headers["X-API-Key"]
        seen["body"] = json.loads(request.content)
        return httpx.Response(201, json={"id": 42})

    handle = await _vexa(handler).start_bot(
        platform=P.TEAMS, native_meeting_id="938", passcode="pw", bot_name="GigsNano Notetaker")
    assert handle.external_id == "42"
    assert seen["key"] == "key"
    assert seen["body"] == {"platform": "teams", "native_meeting_id": "938",
                            "bot_name": "GigsNano Notetaker", "passcode": "pw",
                            "automatic_leave": {"max_time_left_alone": 60000, "no_one_joined_timeout": 300000}}


async def test_vexa_state_maps_status_and_sorts_segments():
    def handler(request):
        assert request.url.path == "/transcripts/google_meet/abc-defg-hij"
        return httpx.Response(200, json={"status": "active", "segments": [
            {"start": 5.5, "end": 7.0, "text": " second ", "speaker": "Alan"},
            {"start": 1.0, "end": 3.25, "text": "first", "speaker": "Ada"},
        ]})

    state = await _vexa(handler).get_state(platform=P.GOOGLE_MEET, native_meeting_id="abc-defg-hij")
    assert state.status is S.IN_CALL
    assert [(s.seq, s.speaker, s.text, s.start_ms, s.end_ms) for s in state.segments] == [
        (0, "Ada", "first", 1000, 3250), (1, "Alan", "second", 5500, 7000)]


async def test_vexa_failure_reason_is_humanised():
    def handler(request):
        return httpx.Response(200, json={"status": "failed", "data": {"failure_reason": "zoom_requires_rtms"}})

    state = await _vexa(handler).get_state(platform=P.ZOOM, native_meeting_id="1")
    assert state.status is S.FAILED
    assert state.failure_reason == "Zoom blocked the notetaker from joining."


async def test_vexa_errors_raise_meeting_bot_error_and_stop_tolerates_404():
    with pytest.raises(MeetingBotError):
        await _vexa(lambda r: httpx.Response(500)).start_bot(
            platform=P.ZOOM, native_meeting_id="1", passcode=None, bot_name="x")
    await _vexa(lambda r: httpx.Response(404)).stop_bot(platform=P.ZOOM, native_meeting_id="1")


async def test_vexa_unknown_status_maps_to_no_status_change():
    """A Vexa status we don't recognise must not be guessed as JOINING — that
    would regress an in-call meeting and trip the 20-minute admission timeout
    (service.apply_bot_state treats status=None as "keep the current status")."""
    def handler(request):
        return httpx.Response(200, json={"status": "some_new_vexa_status", "segments": []})

    state = await _vexa(handler).get_state(platform=P.ZOOM, native_meeting_id="1")
    assert state.status is None


async def test_vexa_get_state_percent_encodes_path_traversal_in_native_id():
    """A native_meeting_id lifted from an unvalidated meeting link (e.g. a Teams
    meetup-join segment) must never be able to redirect our authenticated Vexa
    call to an arbitrary path via `../` or `?`."""
    evil_id = "../../admin/users?x=1"
    seen = {}

    def handler(request):
        seen["path"] = request.url.path
        seen["raw_path"] = request.url.raw_path.decode()
        return httpx.Response(200, json={"status": "active", "segments": []})

    await _vexa(handler).get_state(platform=P.GOOGLE_MEET, native_meeting_id=evil_id)

    # httpx's `.path` re-decodes percent-escapes for display, so the wire proof
    # is `.raw_path` — the bytes actually sent, which must carry the encoded
    # form rather than a literal "/" or "?" that would let the request escape
    # onto a different Vexa path/query.
    expected_segment = quote(evil_id, safe="")
    assert seen["raw_path"] == f"/transcripts/google_meet/{expected_segment}"
    assert "/../" not in seen["raw_path"]
    assert seen["raw_path"].count("?") == 0


async def test_vexa_stop_bot_percent_encodes_path_traversal_in_native_id():
    evil_id = "../../admin/users?x=1"
    seen = {}

    def handler(request):
        seen["raw_path"] = request.url.raw_path.decode()
        return httpx.Response(204)

    await _vexa(handler).stop_bot(platform=P.GOOGLE_MEET, native_meeting_id=evil_id)

    expected_segment = quote(evil_id, safe="")
    assert seen["raw_path"] == f"/bots/google_meet/{expected_segment}"


async def test_vexa_absolute_epoch_segment_times_become_meeting_offsets():
    # Real Vexa v0.12.27 payload shape (prod spike 2026-09-19): segment start/end are
    # absolute Unix seconds, not offsets. Multiplying them by 1000 overflowed the
    # INTEGER start_ms/end_ms columns and every sync tick rolled back.
    def handler(request):
        return httpx.Response(200, json={
            "status": "active",
            "start_time": "2026-09-19T15:49:30.000000",
            "segments": [
                {"start": 1789832990.5, "end": 1789832994.0, "text": "second", "speaker": "B"},
                {"start": 1789832970.911, "end": 1789832980.127, "text": "first", "speaker": "A"},
            ],
        })

    state = await _vexa(handler).get_state(platform=P.GOOGLE_MEET, native_meeting_id="hxa-uiea-gzs")
    offsets = [(s.start_ms, s.end_ms) for s in state.segments]
    assert offsets[0][0] >= 0 and all(v < 2**31 for pair in offsets for v in pair)
    # relative to the meeting start_time (15:49:30Z = 1789832970.0)
    assert offsets == [(911, 10127), (20500, 24000)]


async def test_vexa_relative_segment_times_are_left_alone():
    def handler(request):
        return httpx.Response(200, json={"status": "active", "segments": [
            {"start": 1.0, "end": 3.25, "text": "a", "speaker": "A"}]})

    state = await _vexa(handler).get_state(platform=P.ZOOM, native_meeting_id="1")
    assert [(s.start_ms, s.end_ms) for s in state.segments] == [(1000, 3250)]


async def test_vexa_start_sends_language_only_when_configured():
    bodies = []

    def handler(request):
        bodies.append(json.loads(request.content))
        return httpx.Response(201, json={"id": 1})

    await _vexa(handler).start_bot(platform=P.ZOOM, native_meeting_id="1", passcode=None, bot_name="x")
    pinned = VexaMeetingBotProvider("http://vexa", "key", transport=httpx.MockTransport(handler), language="ar")
    await pinned.start_bot(platform=P.ZOOM, native_meeting_id="2", passcode=None, bot_name="x")
    assert "language" not in bodies[0]  # default: auto-detect, any spoken language
    assert bodies[1]["language"] == "ar"


async def test_vexa_drops_known_whisper_hallucinations_and_renumbers():
    # Seen live 2026-09-19/21 with OpenAI whisper-1 on silent chunks.
    def handler(request):
        return httpx.Response(200, json={"status": "active", "segments": [
            {"start": 1.0, "end": 2.0, "text": "Thank you for watching.", "speaker": "A"},
            {"start": 3.0, "end": 5.0, "text": "Create a new bug for the login page.", "speaker": "A"},
            {"start": 6.0, "end": 7.0, "text": " Transcribed by https://otter.ai ", "speaker": "A"},
            {"start": 8.0, "end": 9.0, "text": "Subtitles by the Amara.org community", "speaker": "B"},
            {"start": 10.0, "end": 12.0, "text": "Thanks for watching the demo, now the roadmap.", "speaker": "B"},
        ]})

    state = await _vexa(handler).get_state(platform=P.GOOGLE_MEET, native_meeting_id="abc-defg-hij")
    assert [(s.seq, s.text) for s in state.segments] == [
        (0, "Create a new bug for the login page."),
        (1, "Thanks for watching the demo, now the roadmap."),  # real speech containing the words is kept
    ]
