"""C2: the BMAD story-chat turn runs on run_agent with the internal read-only belt.

These assert the *new* capability (a belt tool runs mid-turn without changing the
observable SSE contract). The behavior-preservation guarantee lives in
test_chat_sse.py, which passes unchanged through this same run_agent path.
"""

from gigsnano_api.bmad.provider import FakeProvider

from .test_chat_sse import open_prd_thread, stream_events


async def test_belt_tool_runs_then_answers(app, client):
    base = await open_prd_thread(client)
    project_id = base.split("/projects/")[1].split("/stories/")[0]
    # Round 1: the agent calls a belt code tool; round 2: it answers with text.
    app.state.llm_provider = FakeProvider(
        rounds=[
            {
                "tool": "search_symbols",
                "id": "tu1",
                "input": {"project_id": project_id, "name": "main"},
            },
            {"text": "Here is what I found."},
        ]
    )
    events = await stream_events(client, f"{base}/thread/messages/", "Explain the code")

    types = [e["type"] for e in events]
    assert types[0] == "start"
    assert "text-start" in types and "text-end" in types and types[-1] == "finish"
    # The belt tool ran silently (no new frame types) and the post-tool answer streamed.
    assert "tool_call" not in types and "tool_result" not in types
    text = "".join(e["delta"] for e in events if e["type"] == "text-delta")
    assert text == "Here is what I found."

    thread = (await client.get(f"{base}/thread/")).json()
    # A belt-only turn keeps the session conversing — no finalize was proposed.
    assert thread["state"] == "conversing"
    assert thread["messages"][-1]["content"] == "Here is what I found."
