"""Integration tests for the confirm-tools resume path (GIN-33 Task 8):
the agentic GigsAI chat can run a read-only tool inline, and must pause a
mutating tool for client confirmation, then resume correctly on approval."""

from sqlalchemy import select

from gigsnano_api.bmad.provider import FakeProvider
from gigsnano_api.models import ELlmUsageSource, GigsThread, LlmUsageEvent, Story
from tests.test_gigs_ai import _read_sse, setup_ws

CREATE_PROJECT = {
    "name": "Mobile App", "identifier": "MBA", "flow": "fresh",
    "cover_image_url": "https://img.test/c.jpg",
}


async def _setup_project(client) -> dict:
    await setup_ws(client)
    return (await client.post("/api/workspaces/acme/projects/", json=CREATE_PROJECT)).json()


async def test_gigs_ai_query_tool_streams_result(app, client, db_session):
    app.state.llm_provider = FakeProvider(
        rounds=[
            {"tool": "query_work_items", "input": {}, "id": "t1"},
            {"text": "There are 3 pending."},
        ]
    )
    await setup_ws(client)
    tid = (await client.post("/api/workspaces/acme/gigs-ai/threads/", json={})).json()["id"]

    async with client.stream(
        "POST",
        f"/api/workspaces/acme/gigs-ai/threads/{tid}/messages/",
        json={"content": "how many tasks are pending?"},
    ) as res:
        assert res.status_code == 200
        events, text = await _read_sse(res)

    types = [e["type"] for e in events]
    assert "tool_call" in types and "tool_result" in types
    tool_call = next(e for e in events if e["type"] == "tool_call")
    assert tool_call["name"] == "query_work_items" and tool_call["tool_use_id"] == "t1"
    tool_result = next(e for e in events if e["type"] == "tool_result")
    assert tool_result["tool_use_id"] == "t1" and tool_result["is_error"] is False
    assert text == "There are 3 pending."

    usage = (
        await db_session.execute(
            select(LlmUsageEvent).where(LlmUsageEvent.source == ELlmUsageSource.GIGS_AI)
        )
    ).scalars().all()
    assert len(usage) == 1
    # two rounds (tool + text), tokens summed: 10+20 each -> 20 in / 40 out
    assert usage[0].input_tokens == 20 and usage[0].output_tokens == 40


async def test_gigs_ai_create_tool_confirmation_flow(app, client, db_session):
    project = await _setup_project(client)
    app.state.llm_provider = FakeProvider(
        rounds=[
            {
                "tool": "create_work_item",
                "input": {"project": project["id"], "title": "New onboarding task"},
                "id": "t1",
            }
        ]
    )
    tid = (
        await client.post(
            "/api/workspaces/acme/gigs-ai/threads/", json={"project_id": project["id"]}
        )
    ).json()["id"]

    async with client.stream(
        "POST",
        f"/api/workspaces/acme/gigs-ai/threads/{tid}/messages/",
        json={"content": "create a task for onboarding"},
    ) as res:
        assert res.status_code == 200
        events, _ = await _read_sse(res)

    types = [e["type"] for e in events]
    assert "tool_confirmation" in types
    confirmation = next(e for e in events if e["type"] == "tool_confirmation")
    assert confirmation["tool_use_id"] == "t1" and confirmation["name"] == "create_work_item"

    # A tool-only turn (model went straight to a mutating tool with no preamble)
    # must still emit a lead-in text part: the client hosts the confirmation card
    # inside an assistant message, so a text-less turn would render no bubble and
    # the user would have nothing to approve.
    lead = "".join(e.get("delta", "") for e in events if e["type"] == "text-delta")
    assert lead.strip() != ""

    thread = await db_session.get(GigsThread, tid)
    assert thread.pending_tool_calls is not None
    assert thread.pending_tool_calls["messages"][-1]["role"] == "assistant"

    app.state.llm_provider = FakeProvider(rounds=[{"text": "Created."}])

    async with client.stream(
        "POST",
        f"/api/workspaces/acme/gigs-ai/threads/{tid}/confirm-tools/",
        json={"decisions": [{"tool_use_id": "t1", "approved": True}]},
    ) as res:
        assert res.status_code == 200
        events, text = await _read_sse(res)

    types = [e["type"] for e in events]
    assert types[0] == "start" and "tool_result" in types
    assert text == "Created."

    stories = (
        await db_session.execute(select(Story).where(Story.project_id == project["id"]))
    ).scalars().all()
    assert any(s.title == "New onboarding task" for s in stories)

    db_session.expire_all()
    thread = await db_session.get(GigsThread, tid)
    assert thread.pending_tool_calls is None


async def test_confirm_tools_404_without_pending(client):
    await setup_ws(client)
    tid = (await client.post("/api/workspaces/acme/gigs-ai/threads/", json={})).json()["id"]
    res = await client.post(
        f"/api/workspaces/acme/gigs-ai/threads/{tid}/confirm-tools/",
        json={"decisions": []},
    )
    assert res.status_code == 404


async def test_gigs_ai_paused_confirmation_still_charges_usage(app, client, db_session):
    """GIN-33 I3: a turn paused on `tool_confirmation` and never confirmed must
    still record the tokens the model already spent reaching that pause."""
    project = await _setup_project(client)
    app.state.llm_provider = FakeProvider(
        rounds=[
            {
                "tool": "create_work_item",
                "input": {"project": project["id"], "title": "Abandoned"},
                "id": "t1",
            }
        ]
    )
    tid = (
        await client.post(
            "/api/workspaces/acme/gigs-ai/threads/", json={"project_id": project["id"]}
        )
    ).json()["id"]

    async with client.stream(
        "POST",
        f"/api/workspaces/acme/gigs-ai/threads/{tid}/messages/",
        json={"content": "create a task"},
    ) as res:
        assert res.status_code == 200
        events, _ = await _read_sse(res)
    assert "tool_confirmation" in [e["type"] for e in events]

    # Never confirmed — but the round that produced the pause must already be billed.
    usage = (
        await db_session.execute(
            select(LlmUsageEvent).where(LlmUsageEvent.source == ELlmUsageSource.GIGS_AI)
        )
    ).scalars().all()
    assert len(usage) == 1
    assert usage[0].input_tokens == 10 and usage[0].output_tokens == 20


async def test_confirm_tools_second_call_is_idempotent(app, client, db_session):
    """GIN-33 I4: a retried confirm-tools call after a successful approve must
    404 (pending state already cleared), not re-run the approved write."""
    project = await _setup_project(client)
    app.state.llm_provider = FakeProvider(
        rounds=[
            {
                "tool": "create_work_item",
                "input": {"project": project["id"], "title": "Once only"},
                "id": "t1",
            }
        ]
    )
    tid = (
        await client.post(
            "/api/workspaces/acme/gigs-ai/threads/", json={"project_id": project["id"]}
        )
    ).json()["id"]
    async with client.stream(
        "POST",
        f"/api/workspaces/acme/gigs-ai/threads/{tid}/messages/",
        json={"content": "create a task"},
    ) as res:
        await _read_sse(res)

    app.state.llm_provider = FakeProvider(rounds=[{"text": "Created."}])
    body = {"decisions": [{"tool_use_id": "t1", "approved": True}]}
    async with client.stream(
        "POST", f"/api/workspaces/acme/gigs-ai/threads/{tid}/confirm-tools/", json=body
    ) as res:
        assert res.status_code == 200
        await _read_sse(res)

    retry = await client.post(
        f"/api/workspaces/acme/gigs-ai/threads/{tid}/confirm-tools/", json=body
    )
    assert retry.status_code == 404

    stories = (
        await db_session.execute(
            select(Story).where(Story.project_id == project["id"], Story.title == "Once only")
        )
    ).scalars().all()
    assert len(stories) == 1


async def test_gigs_ai_create_tool_denied_declines(app, client, db_session):
    project = await _setup_project(client)
    app.state.llm_provider = FakeProvider(
        rounds=[
            {
                "tool": "create_work_item",
                "input": {"project": project["id"], "title": "Should not exist"},
                "id": "t1",
            }
        ]
    )
    tid = (
        await client.post(
            "/api/workspaces/acme/gigs-ai/threads/", json={"project_id": project["id"]}
        )
    ).json()["id"]
    async with client.stream(
        "POST",
        f"/api/workspaces/acme/gigs-ai/threads/{tid}/messages/",
        json={"content": "create a task"},
    ) as res:
        await _read_sse(res)

    app.state.llm_provider = FakeProvider(rounds=[{"text": "Okay, cancelled."}])
    async with client.stream(
        "POST",
        f"/api/workspaces/acme/gigs-ai/threads/{tid}/confirm-tools/",
        json={"decisions": [{"tool_use_id": "t1", "approved": False}]},
    ) as res:
        events, text = await _read_sse(res)

    assert text == "Okay, cancelled."
    tool_result = next(e for e in events if e["type"] == "tool_result")
    assert tool_result["is_error"] is True

    stories = (
        await db_session.execute(select(Story).where(Story.project_id == project["id"]))
    ).scalars().all()
    assert not any(s.title == "Should not exist" for s in stories)


async def test_gigs_ai_create_tool_nests_under_parent(app, client, db_session):
    """create_work_item with `parent` nests the new item under that work item —
    what turns 'an epic and its stories' into a real hierarchy instead of flat
    items that only name the epic in prose."""
    project = await _setup_project(client)
    # An epic to parent under (first story in a fresh project -> code MBA-1).
    epic = (
        await client.post(
            f"/api/workspaces/acme/projects/{project['id']}/stories/",
            json={"title": "Customizable Dashboards", "type": "epic"},
        )
    ).json()

    app.state.llm_provider = FakeProvider(
        rounds=[
            {
                "tool": "create_work_item",
                "input": {
                    "project": project["id"],
                    "title": "Dashboard CRUD",
                    "type": "story",
                    "parent": epic["code"],
                },
                "id": "t1",
            }
        ]
    )
    tid = (await client.post("/api/workspaces/acme/gigs-ai/threads/", json={})).json()["id"]
    async with client.stream(
        "POST",
        f"/api/workspaces/acme/gigs-ai/threads/{tid}/messages/",
        json={"content": "create the dashboard CRUD story under the epic"},
    ) as res:
        assert res.status_code == 200
        await _read_sse(res)

    app.state.llm_provider = FakeProvider(rounds=[{"text": "Done."}])
    async with client.stream(
        "POST",
        f"/api/workspaces/acme/gigs-ai/threads/{tid}/confirm-tools/",
        json={"decisions": [{"tool_use_id": "t1", "approved": True}]},
    ) as res:
        assert res.status_code == 200
        events, _ = await _read_sse(res)

    tool_result = next(e for e in events if e["type"] == "tool_result")
    assert tool_result["is_error"] is False

    child = (
        await db_session.execute(select(Story).where(Story.title == "Dashboard CRUD"))
    ).scalar_one()
    assert child.parent_id == epic["id"]  # nested under the epic


async def test_gigs_ai_create_tool_rejects_cross_project_parent(app, client, db_session):
    """A `parent` in a different project than the new item is refused, not silently
    dropped — the caller learns the link didn't happen."""
    project = await _setup_project(client)
    other = (
        await client.post(
            "/api/workspaces/acme/projects/",
            json={**CREATE_PROJECT, "name": "Other", "identifier": "OTH"},
        )
    ).json()
    other_epic = (
        await client.post(
            f"/api/workspaces/acme/projects/{other['id']}/stories/",
            json={"title": "Other epic", "type": "epic"},
        )
    ).json()

    app.state.llm_provider = FakeProvider(
        rounds=[
            {
                "tool": "create_work_item",
                "input": {
                    "project": project["id"],
                    "title": "Wrong-parent story",
                    "type": "story",
                    "parent": other_epic["code"],
                },
                "id": "t1",
            }
        ]
    )
    tid = (await client.post("/api/workspaces/acme/gigs-ai/threads/", json={})).json()["id"]
    async with client.stream(
        "POST",
        f"/api/workspaces/acme/gigs-ai/threads/{tid}/messages/",
        json={"content": "create it"},
    ) as res:
        await _read_sse(res)

    app.state.llm_provider = FakeProvider(rounds=[{"text": "Noted."}])
    async with client.stream(
        "POST",
        f"/api/workspaces/acme/gigs-ai/threads/{tid}/confirm-tools/",
        json={"decisions": [{"tool_use_id": "t1", "approved": True}]},
    ) as res:
        events, _ = await _read_sse(res)

    tool_result = next(e for e in events if e["type"] == "tool_result")
    assert tool_result["is_error"] is True
    stories = (
        await db_session.execute(select(Story).where(Story.project_id == project["id"]))
    ).scalars().all()
    assert not any(s.title == "Wrong-parent story" for s in stories)
