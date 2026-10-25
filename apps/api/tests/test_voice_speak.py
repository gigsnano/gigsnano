"""POST .../speak/ synthesizes one sentence of an agent's reply (GIN-491 Task 7).

One sentence, not one turn, on purpose: playback starts before the reply has
finished generating, and a sentence boundary is where barge-in can cut cleanly.
"""

from gigsnano_api.voice import provider as provider_mod


async def setup_session(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": "ada@example.test", "password": "s3cret!"})
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    res = await client.post("/api/workspaces/acme/voice/sessions/",
                            json={"locale": "en-US", "agent_profile_version": 1})
    return res.json()["session_id"]


async def test_speak_returns_audio(client):
    session_id = await setup_session(client)
    res = await client.post(
        f"/api/workspaces/acme/voice/sessions/{session_id}/speak/",
        json={"text": "The sprint is on track."})
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("audio/")
    assert len(res.content) > 0


async def test_speak_rejects_empty_text(client):
    session_id = await setup_session(client)
    res = await client.post(f"/api/workspaces/acme/voice/sessions/{session_id}/speak/",
                            json={"text": "   "})
    assert res.status_code == 400


async def test_speak_needs_a_live_session(client):
    await setup_session(client)
    res = await client.post("/api/workspaces/acme/voice/sessions/not-a-session/speak/",
                            json={"text": "hello"})
    assert res.status_code == 404


async def test_speak_surfaces_a_provider_error_as_502_not_empty_audio(client, monkeypatch):
    """A vendor failure must reach the client as a 502 carrying the error code —
    never as a 200 with empty audio, which is indistinguishable from success to a
    caller that doesn't inspect byte length.

    `FakeVoiceSession.synthesize` normally emits SYNTHESIS_CHUNK/DONE. Here it is
    swapped for a call to the real `inject_error` test seam (unmodified — see
    provider.py), so the ERROR event it emits flows through the route's own
    `ordered(session.events())` loop and its real `except ERROR -> 502` branch.
    If that branch were ever deleted, this test would see a 200 with empty
    `audio/mpeg` content instead and fail.
    """
    # This repo's .env carries a real Azure Speech key (used elsewhere for live
    # benchmarking), which would otherwise route /speak/ to AzureSpeechSession
    # instead of the fake. Force the fake adapter, same as
    # test_voice_sessions.py::test_policy_reports_which_adapter_is_live.
    monkeypatch.setattr(provider_mod.settings, "azure_speech_key", "")

    session_id = await setup_session(client)

    async def failing_synthesize(self, text):
        await self.inject_error("provider_unavailable", retryable=True)

    monkeypatch.setattr(provider_mod.FakeVoiceSession, "synthesize", failing_synthesize)

    res = await client.post(
        f"/api/workspaces/acme/voice/sessions/{session_id}/speak/",
        json={"text": "The sprint is on track."})

    assert res.status_code == 502
    assert "provider_unavailable" in res.text
    assert res.headers["content-type"] != "audio/mpeg"
