import pytest
from sqlalchemy import select

from gigsnano_api.bmad.provider import FakeProvider
from gigsnano_api.models.gigs import GigsMessage
from tests.test_gigs_ai import _read_sse, setup_ws


async def _make_room(client):
    """Room participants are real `agents` table rows now — resolve the seeded
    builtin Analyst/Architect ids from the live roster instead of hardcoding the
    old static-registry ids, which no longer match a workspace's actual agents."""
    await setup_ws(client)
    experts = {e["name"]: e["id"] for e in (await client.get("/api/workspaces/acme/rooms/experts/")).json()}
    analyst_id, architect_id = experts["Analyst"], experts["Architect"]
    r = await client.post(
        "/api/workspaces/acme/rooms/",
        json={"title": "Design review", "participant_agent_ids": [analyst_id, architect_id]},
    )
    return r.json()["id"], analyst_id, architect_id


@pytest.mark.asyncio
async def test_advance_runs_one_round_round_robin_with_speakers(app, client, db_session):
    room_id, analyst_id, architect_id = await _make_room(client)
    app.state.llm_provider = FakeProvider(rounds=[{"text": "Mary take"}, {"text": "Winston take"}])

    async with client.stream(
        "POST", f"/api/workspaces/acme/rooms/{room_id}/advance/", json={"content": "kick off"}
    ) as res:
        assert res.status_code == 200
        events, _ = await _read_sse(res)

    speakers = [e for e in events if e["type"] == "room_speaker"]
    assert [s["speaker_id"] for s in speakers] == [analyst_id, architect_id]

    msgs = (
        await db_session.execute(
            select(GigsMessage).where(GigsMessage.thread_id == room_id).order_by(GigsMessage.created_at)
        )
    ).scalars().all()
    # human turn + 2 agent turns, speaker attributed
    assert [(m.role.value, m.speaker) for m in msgs] == [
        ("user", None), ("assistant", analyst_id), ("assistant", architect_id),
    ]
    # Deterministic persisted ordering: each assistant turn's created_at strictly
    # increases within the round (belt-and-suspenders against same-microsecond
    # timestamp collisions on Postgres), and both land after the human message.
    user_msg, analyst_msg, architect_msg = msgs
    assert user_msg.created_at <= analyst_msg.created_at < architect_msg.created_at


@pytest.mark.asyncio
async def test_human_message_resets_cap_and_advance_increments(app, client, db_session):
    from gigsnano_api.models.gigs import GigsThread

    room_id, _, _ = await _make_room(client)
    app.state.llm_provider = FakeProvider(rounds=[{"text": "a"}, {"text": "b"}, {"text": "a"}, {"text": "b"}])

    async with client.stream("POST", f"/api/workspaces/acme/rooms/{room_id}/advance/", json={"content": "go"}) as res:
        await _read_sse(res)
    t = await db_session.get(GigsThread, room_id)
    await db_session.refresh(t)
    assert t.rounds_since_human == 1  # reset by human msg, then +1 for the round

    async with client.stream("POST", f"/api/workspaces/acme/rooms/{room_id}/advance/", json={}) as res:
        await _read_sse(res)
    await db_session.refresh(t)
    assert t.rounds_since_human == 2  # continue (no human msg) → +1


@pytest.mark.asyncio
async def test_advance_refuses_past_cap_without_human(app, client, db_session):
    from gigsnano_api.features.experts.router import ROOM_ROUND_CAP
    from gigsnano_api.models.gigs import GigsThread

    room_id, _, _ = await _make_room(client)
    t = await db_session.get(GigsThread, room_id)
    t.rounds_since_human = ROOM_ROUND_CAP
    await db_session.commit()
    app.state.llm_provider = FakeProvider(rounds=[{"text": "x"}, {"text": "y"}])

    async with client.stream("POST", f"/api/workspaces/acme/rooms/{room_id}/advance/", json={}) as res:
        events, _ = await _read_sse(res)
    assert any(e["type"] == "error" for e in events)
    assert not any(e["type"] == "room_speaker" for e in events)
