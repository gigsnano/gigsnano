from sqlalchemy import select

from gigsnano_api.models import EChatRole
from gigsnano_api.models.gigs import GigsMessage, GigsThread


async def test_room_thread_and_speaker_persist(db_session, make_workspace):
    workspace = await make_workspace()
    thread = GigsThread(
        workspace_id=workspace.id,
        kind="room",
        participant_agent_ids=["agent_analyst", "agent_architect"],
    )
    db_session.add(thread)
    await db_session.flush()
    db_session.add(
        GigsMessage(
            thread_id=thread.id,
            role=EChatRole.ASSISTANT,
            content="hi",
            speaker="agent_analyst",
        )
    )
    await db_session.commit()

    got = (
        await db_session.execute(select(GigsThread).where(GigsThread.id == thread.id))
    ).scalar_one()
    assert got.kind == "room"
    assert got.participant_agent_ids == ["agent_analyst", "agent_architect"]
    assert got.rounds_since_human == 0
    msg = (
        await db_session.execute(select(GigsMessage).where(GigsMessage.thread_id == thread.id))
    ).scalar_one()
    assert msg.speaker == "agent_analyst"
