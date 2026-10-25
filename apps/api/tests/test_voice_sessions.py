"""Voice session broker + reconnect lifecycle (GIN-502).

The four reconnect tests at the bottom are the point of this file: a voice session
can drop at any of four moments, and three of them have a wrong answer that looks
right (replay the partial, replay the audio, re-run the confirmed tool).
"""

import httpx
import pytest

from gigsnano_api.features.voice import service as S

BASE = "/api/workspaces/acme/voice/sessions/"


async def start(client, **body):
    return await client.post(BASE, json={"locale": "en-AE", **body})


@pytest.fixture(autouse=True)
def clean_broker():
    S.reset_sessions()
    yield
    S.reset_sessions()


@pytest.fixture
async def seeded_workspace(client):
    """Signed-in owner of workspace `acme` — the actor every session binds to."""
    await client.post(
        "/api/auth/sign-up/",
        json={"display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!"},
    )
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})


@pytest.fixture
async def other_client(app, seeded_workspace):
    """A different signed-in user who is NOT a member of `acme`."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as other:
        await other.post(
            "/api/auth/sign-up/",
            json={"display_name": "Mallory", "email": "mal@example.test", "password": "s3cret!"},
        )
        yield other


@pytest.mark.asyncio
async def test_start_returns_a_short_lived_scoped_credential(client, seeded_workspace):
    response = await start(client)
    assert response.status_code == 200
    body = response.json()
    assert body["session_id"]
    assert body["token"]
    assert body["expires_at"]
    assert body["locale"] == "en-AE"


@pytest.mark.asyncio
async def test_no_provider_credential_ever_reaches_the_client(client, seeded_workspace):
    """AC1. The browser gets OUR session token and nothing else.

    Asserted as a *closed* claim set rather than by searching for a known secret:
    there is no vendor key to plant yet, and the failure this guards against is
    the future adapter that helpfully passes one through to save a round-trip.
    """
    body = (await start(client)).json()
    claims = S.decode_session_token(body["token"])
    assert set(claims) == {
        "sub", "sid", "ws", "ver", "loc", "origin", "epoch", "aud", "type", "exp",
    }
    assert S.settings.jwt_secret not in str(body)


@pytest.mark.asyncio
async def test_session_token_is_bound_to_actor_tenant_and_profile(client, seeded_workspace):
    body = (await start(client, agent_profile_version=3)).json()
    claims = S.decode_session_token(body["token"])
    assert claims["ws"] == "acme"
    assert claims["sub"]
    assert claims["ver"] == 3
    assert claims["sid"] == body["session_id"]


@pytest.mark.asyncio
async def test_an_ended_session_cannot_heartbeat_or_reconnect(client, seeded_workspace):
    """AC2. Revocation that only hides the session from the UI is not revocation."""
    sid = (await start(client)).json()["session_id"]
    assert (await client.delete(f"{BASE}{sid}/")).status_code == 200
    assert (await client.post(f"{BASE}{sid}/heartbeat/", json={})).status_code == 410
    assert (await client.post(f"{BASE}{sid}/reconnect/", json={})).status_code == 410


@pytest.mark.asyncio
async def test_an_expired_session_cannot_reconnect(client, seeded_workspace):
    sid = (await start(client)).json()["session_id"]
    S.expire_now(sid)
    assert (await client.post(f"{BASE}{sid}/reconnect/", json={})).status_code == 410


@pytest.mark.asyncio
async def test_single_concurrency_revokes_the_previous_session(client, seeded_workspace):
    """AC4. Two live sessions for one actor means two microphones and two agents
    racing to mutate the same work item."""
    first = (await start(client)).json()["session_id"]
    second = (await start(client)).json()["session_id"]
    assert first != second
    assert (await client.post(f"{BASE}{first}/heartbeat/", json={})).status_code == 410
    assert (await client.post(f"{BASE}{second}/heartbeat/", json={})).status_code == 200


@pytest.mark.asyncio
async def test_heartbeat_extends_expiry(client, seeded_workspace):
    sid = (await start(client)).json()["session_id"]
    S.nearly_expire(sid)
    before = S.get(sid).expires_at
    after = (await client.post(f"{BASE}{sid}/heartbeat/", json={})).json()["expires_at"]
    assert after > before.isoformat()


# ── Network loss at each of the four moments (AC5) ────────────────────────────


@pytest.mark.asyncio
async def test_loss_while_listening_restores_finals_but_never_the_partial(
    client, seeded_workspace
):
    """A partial is a guess. Restoring it puts words in the user's mouth that the
    final would have corrected."""
    sid = (await start(client)).json()["session_id"]
    await client.post(f"{BASE}{sid}/heartbeat/", json={"transcript_final": "create a bug"})
    S.note_partial(sid, "create a bugg-")

    restored = (await client.post(f"{BASE}{sid}/reconnect/", json={})).json()
    assert restored["transcript"] == ["create a bug"]
    assert "bugg-" not in str(restored)


@pytest.mark.asyncio
async def test_loss_while_speaking_never_replays_audio(client, seeded_workspace):
    sid = (await start(client)).json()["session_id"]
    S.note_speaking(sid)
    restored = (await client.post(f"{BASE}{sid}/reconnect/", json={})).json()
    assert restored["pending_audio_dropped"] is True
    assert restored.get("audio") in (None, "", [])


@pytest.mark.asyncio
async def test_loss_at_preview_returns_the_draft_unconfirmed(client, seeded_workspace):
    """The draft survives so the user does not re-dictate it — but it comes back
    as a proposal, never as a write that quietly completed itself."""
    sid = (await start(client)).json()["session_id"]
    draft = {"type": "bug", "title": "Mobile login fails after OTP", "priority": "high"}
    await client.post(f"{BASE}{sid}/heartbeat/", json={"draft": draft})

    restored = (await client.post(f"{BASE}{sid}/reconnect/", json={})).json()
    assert restored["draft"] == draft
    assert restored["requires_confirmation"] is True


@pytest.mark.asyncio
async def test_loss_during_execution_reports_in_flight_instead_of_re_running(
    client, seeded_workspace
):
    """The duplicate-item bug lives here: re-issuing a confirmed create because the
    socket died between request and response."""
    sid = (await start(client)).json()["session_id"]
    S.note_execution(sid, idempotency_key="idem-1")

    restored = (await client.post(f"{BASE}{sid}/reconnect/", json={})).json()
    assert restored["in_flight"] == {"idempotency_key": "idem-1"}
    assert restored["requires_confirmation"] is False


@pytest.mark.asyncio
async def test_reconnect_rotates_the_token_so_the_old_one_stops_working(
    client, seeded_workspace
):
    """AC3 "exactly once": a client that reconnects twice, or an attacker holding a
    captured token, must not end up with two live grants on one session."""
    body = (await start(client)).json()
    old = S.decode_session_token(body["token"])
    new = S.decode_session_token(
        (await client.post(f"{BASE}{body['session_id']}/reconnect/", json={})).json()["token"]
    )
    assert new["epoch"] > old["epoch"]
    assert not S.token_is_current(old)
    assert S.token_is_current(new)


@pytest.mark.asyncio
async def test_a_stranger_cannot_touch_someone_elses_session(
    client, other_client, seeded_workspace
):
    sid = (await start(client)).json()["session_id"]
    assert (await other_client.post(f"{BASE}{sid}/heartbeat/", json={})).status_code in (403, 404)


# ── Policy + transcription endpoints (end-to-end wiring) ─────────────────────

POLICY = "/api/workspaces/acme/voice/policy/"


@pytest.mark.asyncio
async def test_policy_says_disabled_with_a_reason_by_default(client, seeded_workspace):
    """Voice is off until a workspace is in the allowlist, and the UI is told why
    — "the button is greyed out and I don't know why" is the ticket this avoids."""
    body = (await client.get(POLICY)).json()
    assert body["enabled"] is False
    assert body["reason"]
    assert body["fallback_to_text"] is True


@pytest.mark.asyncio
async def test_policy_enables_only_an_allowlisted_workspace(client, seeded_workspace, monkeypatch):
    monkeypatch.setattr(S.settings, "voice_enabled_workspaces", "acme")
    assert (await client.get(POLICY)).json()["enabled"] is True

    monkeypatch.setattr(S.settings, "voice_enabled_workspaces", "someone-else")
    off = (await client.get(POLICY)).json()
    assert off["enabled"] is False
    # Either gate is a correct refusal; what matters is that a workspace outside
    # the allowlist is refused and told something actionable.
    assert off["reason"]
    assert off["fallback_to_text"] is True


@pytest.mark.asyncio
async def test_policy_never_advertises_a_locale_the_recogniser_rejects(
    client, seeded_workspace
):
    """en-AE returns 400 from Azure STT. Offering it would break every utterance
    for exactly the users the region was added for."""
    assert "en-AE" not in (await client.get(POLICY)).json()["locales"]


@pytest.mark.asyncio
async def test_policy_reports_which_adapter_is_live(client, seeded_workspace, monkeypatch):
    monkeypatch.setattr(S.settings, "azure_speech_key", "")
    assert (await client.get(POLICY)).json()["provider"] == "fake"


@pytest.mark.asyncio
async def test_transcription_requires_a_live_session(client, seeded_workspace):
    response = await client.post(
        f"{BASE}nope/audio/", files={"audio": ("a.wav", b"x", "audio/wav")}
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_transcription_rejects_empty_audio(client, seeded_workspace):
    sid = (await start(client)).json()["session_id"]
    response = await client.post(
        f"{BASE}{sid}/audio/", files={"audio": ("a.wav", b"", "audio/wav")}
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_a_transcript_is_acknowledged_so_reconnect_restores_it(
    client, seeded_workspace, monkeypatch
):
    """Proves the wiring transcript -> heartbeat -> reconnect.

    Forces the fake: a developer .env carrying a real Speech key would otherwise
    send these two junk bytes to Azure, which rightly rejects them — the test
    would then fail for a reason that has nothing to do with the wiring.
    """
    monkeypatch.setattr(S.settings, "azure_speech_key", "")
    sid = (await start(client)).json()["session_id"]
    body = (
        await client.post(f"{BASE}{sid}/audio/", files={"audio": ("a.wav", b"\x00\x01", "audio/wav")})
    ).json()
    assert body["transcript"]

    restored = (await client.post(f"{BASE}{sid}/reconnect/", json={})).json()
    assert body["transcript"] in restored["transcript"]


@pytest.mark.asyncio
async def test_a_wildcard_opens_voice_to_every_workspace(client, seeded_workspace, monkeypatch):
    """`*` is an explicit token, not "empty means everyone" — a config value that
    silently defaults to maximum exposure is how a pilot becomes a launch."""
    monkeypatch.setattr(S.settings, "voice_enabled_workspaces", "*")
    assert (await client.get(POLICY)).json()["enabled"] is True


@pytest.mark.asyncio
async def test_an_empty_allowlist_still_means_nobody(client, seeded_workspace, monkeypatch):
    monkeypatch.setattr(S.settings, "voice_enabled_workspaces", "")
    assert (await client.get(POLICY)).json()["enabled"] is False
