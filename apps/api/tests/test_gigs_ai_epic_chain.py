"""GIN-478: an epic + child stories is a CHAIN of confirmations — the resumed
turn raises a second `tool_confirmation`. Regression cover for the whole chain
reaching a terminal state (nothing left spinning)."""

from sqlalchemy import select

from gigsnano_api.agent.tools.documents import SEARCH_DOCUMENTS
from gigsnano_api.bmad.provider import FakeProvider
from gigsnano_api.models import GigsThread, Story
from tests.test_gigs_ai import _read_sse, setup_ws

CREATE_PROJECT = {
    "name": "Mobile App", "identifier": "MBA", "flow": "fresh",
    "cover_image_url": "https://img.test/c.jpg",
}


async def _setup_project(client) -> dict:
    await setup_ws(client)
    return (await client.post("/api/workspaces/acme/projects/", json=CREATE_PROJECT)).json()


async def _next_story_number(db_session, project_id: str) -> int:
    """The number the next created item will get (Sprint-0 seeds items first)."""
    numbers = (
        await db_session.execute(select(Story.story_number).where(Story.project_id == project_id))
    ).scalars().all()
    return max(n for n in numbers if n is not None) + 1


async def test_epic_then_stories_second_confirmation(app, client, db_session):
    project = await _setup_project(client)
    pid = project["id"]
    tid = (
        await client.post("/api/workspaces/acme/gigs-ai/threads/", json={"project_id": pid})
    ).json()["id"]

    # Round 1: create the epic -> pauses for confirmation.
    app.state.llm_provider = FakeProvider(
        rounds=[
            {"tool": "create_work_item",
             "input": {"project": pid, "title": "DAMA 3.0", "type": "epic"},
             "id": "epic1"},
        ]
    )
    async with client.stream(
        "POST",
        f"/api/workspaces/acme/gigs-ai/threads/{tid}/messages/",
        json={"content": "create an epic with stories"},
    ) as res:
        events, _ = await _read_sse(res)
    assert "tool_confirmation" in [e["type"] for e in events]

    # Approve. The resumed turn creates the epic, then immediately asks to create
    # a child story -> a SECOND confirmation must reach the client. The epic's code
    # isn't MBA-1: the project seeds Sprint-0 cards first.
    epic_code = f"MBA-{await _next_story_number(db_session, pid)}"
    app.state.llm_provider = FakeProvider(
        rounds=[
            {"tool": "create_work_item",
             "input": {"project": pid, "title": "Gap 1", "type": "story", "parent": epic_code},
             "id": "story1"},
        ]
    )
    async with client.stream(
        "POST",
        f"/api/workspaces/acme/gigs-ai/threads/{tid}/confirm-tools/",
        json={"decisions": [{"tool_use_id": "epic1", "approved": True}]},
    ) as res:
        events, _ = await _read_sse(res)

    types = [e["type"] for e in events]
    assert "tool_result" in types, "epic create must report a result"
    # Every tool_call must reach a terminal event (result or confirmation).
    called = {e["tool_use_id"] for e in events if e["type"] == "tool_call"}
    terminal = {
        e["tool_use_id"] for e in events if e["type"] in ("tool_result", "tool_confirmation")
    }
    assert called <= terminal, f"tool calls left spinning: {called - terminal}"
    assert "tool_confirmation" in types, "second (story) confirmation must be emitted"

    db_session.expire_all()
    thread = await db_session.get(GigsThread, tid)
    assert thread.pending_tool_calls is not None, "second pause must be resumable"

    # Approve the second one: the story is created and nests under the epic.
    app.state.llm_provider = FakeProvider(rounds=[{"text": "Done."}])
    async with client.stream(
        "POST",
        f"/api/workspaces/acme/gigs-ai/threads/{tid}/confirm-tools/",
        json={"decisions": [{"tool_use_id": "story1", "approved": True}]},
    ) as res:
        events, text = await _read_sse(res)
    assert text == "Done."

    stories = (
        await db_session.execute(select(Story).where(Story.project_id == pid))
    ).scalars().all()
    by_title = {s.title: s for s in stories}
    assert "DAMA 3.0" in by_title and "Gap 1" in by_title
    assert by_title["Gap 1"].parent_id == by_title["DAMA 3.0"].id


async def test_resume_survives_a_read_tool_that_raises(app, client, db_session, monkeypatch):
    """GIN-478 root cause: the paused round's READ tools are re-executed on resume.
    They used to run unguarded, so one raising killed the resumed turn — the approved
    create never ran and the client's spinner never got a terminal event."""
    project = await _setup_project(client)
    pid = project["id"]
    tid = (
        await client.post("/api/workspaces/acme/gigs-ai/threads/", json={"project_id": pid})
    ).json()["id"]

    app.state.llm_provider = FakeProvider(
        rounds=[
            {"tool": "create_work_item",
             "input": {"project": pid, "title": "Chat-only bug"},
             "id": "c1"},
        ]
    )
    async with client.stream(
        "POST",
        f"/api/workspaces/acme/gigs-ai/threads/{tid}/messages/",
        json={"content": "log a bug for the flaky sync"},
    ) as res:
        await _read_sse(res)

    # Splice a read tool into the paused round, then make it blow up on resume.
    thread = await db_session.get(GigsThread, tid)
    pending = dict(thread.pending_tool_calls)
    messages = [dict(m) for m in pending["messages"]]
    messages[-1] = {
        "role": "assistant",
        "content": [
            {"type": "tool_use", "id": "r1", "name": "search_documents",
             "input": {"project_id": pid, "query": "story_file"}},
            *messages[-1]["content"],
        ],
    }
    pending["messages"] = messages
    thread.pending_tool_calls = pending
    await db_session.commit()

    async def boom(_ctx, _args):
        raise RuntimeError("graph query wedged")

    monkeypatch.setattr(SEARCH_DOCUMENTS, "handler", boom)

    app.state.llm_provider = FakeProvider(rounds=[{"text": "Created it."}])
    async with client.stream(
        "POST",
        f"/api/workspaces/acme/gigs-ai/threads/{tid}/confirm-tools/",
        json={"decisions": [{"tool_use_id": "c1", "approved": True}]},
    ) as res:
        events, text = await _read_sse(res)

    types = [e["type"] for e in events]
    assert "error" not in types, "a read tool raising must not kill the resumed turn"
    results = {e["tool_use_id"]: e for e in events if e["type"] == "tool_result"}
    assert results["r1"]["is_error"] is True  # reported, not fatal
    assert results["c1"]["is_error"] is False  # the approved write still ran
    assert results["c1"]["link"], "a created item must carry a deep link"
    assert text == "Created it."

    stories = (
        await db_session.execute(select(Story).where(Story.project_id == pid))
    ).scalars().all()
    assert any(s.title == "Chat-only bug" for s in stories)
