"""Tests for LLMProvider.stream_round (Task 4) and the agent runner (Task 5) of
GIN-33."""

import asyncio

import pytest

from gigsnano_api.agent.runner import (
    AgentText,
    AgentToolCall,
    AgentToolConfirm,
    AgentToolResult,
    resume_agent,
    run_agent,
)
from gigsnano_api.agent.tools.base import Tool, ToolRegistry, ToolResult
from gigsnano_api.bmad.provider import FakeProvider, RoundDelta, RoundResult, ToolUse
from gigsnano_api.core.config import settings


@pytest.mark.asyncio
async def test_fake_stream_round_scripts_tool_then_text():
    provider = FakeProvider(
        rounds=[{"tool": "q", "input": {}, "id": "t1"}, {"text": "done"}]
    )

    events1 = [e async for e in provider.stream_round(system=[], messages=[], tools=[])]
    assert len(events1) == 1
    result1 = events1[0]
    assert isinstance(result1, RoundResult)
    assert result1.stop_reason == "tool_use"
    assert result1.tool_uses[0].name == "q"
    assert result1.tool_uses[0].id == "t1"
    assert result1.tool_uses[0].input == {}
    assert result1.assistant_content == [
        {"type": "tool_use", "id": "t1", "name": "q", "input": {}}
    ]

    events2 = [e async for e in provider.stream_round(system=[], messages=[], tools=[])]
    assert any(isinstance(e, RoundDelta) and e.text == "done" for e in events2)
    result2 = events2[-1]
    assert isinstance(result2, RoundResult)
    assert result2.stop_reason == "end_turn"
    assert result2.tool_uses == []
    assert result2.assistant_content == [{"type": "text", "text": "done"}]


async def _query_handler(ctx, args):
    return ToolResult("3 items", summary="Found 3")


def _make_registry(mutating_handler=None):
    tools = [
        Tool(
            name="query_work_items",
            description="q",
            input_schema={"type": "object", "properties": {}},
            handler=_query_handler,
            mutating=False,
        ),
    ]
    if mutating_handler is not None:
        tools.append(
            Tool(
                name="create_work_item",
                description="c",
                input_schema={"type": "object", "properties": {}},
                handler=mutating_handler,
                mutating=True,
            )
        )
    return ToolRegistry(tools)


def _usage_tracker():
    calls = []

    async def on_usage(input_tokens, output_tokens):
        calls.append((input_tokens, output_tokens))

    return on_usage, calls


@pytest.mark.asyncio
async def test_runner_plain_answer():
    provider = FakeProvider(rounds=[{"text": "hi there"}])
    on_usage, calls = _usage_tracker()
    registry = _make_registry()

    events = [
        e
        async for e in run_agent(
            provider,
            system=[],
            messages=[],
            registry=registry,
            ctx=None,
            on_usage=on_usage,
        )
    ]

    text_events = [e for e in events if isinstance(e, AgentText)]
    assert text_events == [AgentText("hi there")]
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_runner_query_then_answer():
    provider = FakeProvider(
        rounds=[
            {"tool": "query_work_items", "input": {}, "id": "t1"},
            {"text": "found some"},
        ]
    )
    on_usage, calls = _usage_tracker()
    registry = _make_registry()
    messages = []

    events = [
        e
        async for e in run_agent(
            provider,
            system=[],
            messages=messages,
            registry=registry,
            ctx=None,
            on_usage=on_usage,
        )
    ]

    assert events[0] == AgentToolCall("t1", "query_work_items", {})
    assert events[1] == AgentToolResult("t1", "Found 3", False)
    assert any(isinstance(e, AgentText) and e.text == "found some" for e in events)
    assert len(calls) == 2
    # tool round appended an assistant turn + a user tool_result turn
    assert messages[0]["role"] == "assistant"
    assert messages[1]["role"] == "user"
    assert messages[1]["content"][0]["tool_use_id"] == "t1"


@pytest.mark.asyncio
async def test_runner_tool_exception_becomes_graceful_error():
    """A handler that raises (e.g. a graph-query timeout) must not crash the turn —
    the runner reports an error tool_result and the loop continues (GIA-10)."""

    async def _boom(ctx, args):
        raise RuntimeError("graph query timed out")

    registry = ToolRegistry([
        Tool(name="query_work_items", description="q",
             input_schema={"type": "object", "properties": {}},
             handler=_boom, mutating=False),
    ])
    provider = FakeProvider(rounds=[
        {"tool": "query_work_items", "input": {}, "id": "t1"},
        {"text": "recovered"},
    ])
    on_usage, _ = _usage_tracker()

    events = [
        e
        async for e in run_agent(
            provider, system=[], messages=[], registry=registry, ctx=None, on_usage=on_usage
        )
    ]

    errors = [e for e in events if isinstance(e, AgentToolResult) and e.is_error]
    assert errors and "failed" in errors[0].summary  # graceful error, not a crash
    assert any(isinstance(e, AgentText) and e.text == "recovered" for e in events)


@pytest.mark.asyncio
async def test_runner_pauses_on_mutating():
    called = {"handler_ran": False}

    async def _create_handler(ctx, args):
        called["handler_ran"] = True
        return ToolResult("created", summary="Created")

    provider = FakeProvider(
        rounds=[{"tool": "create_work_item", "input": {"title": "x"}, "id": "t2"}]
    )
    on_usage, calls = _usage_tracker()
    registry = _make_registry(mutating_handler=_create_handler)

    events = [
        e
        async for e in run_agent(
            provider,
            system=[],
            messages=[],
            registry=registry,
            ctx=None,
            on_usage=on_usage,
            approved_tool_ids=set(),
        )
    ]

    assert AgentToolCall("t2", "create_work_item", {"title": "x"}) in events
    assert AgentToolConfirm("t2", "create_work_item", {"title": "x"}) in events
    assert not any(isinstance(e, AgentToolResult) for e in events)
    assert called["handler_ran"] is False
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_runner_resumes_when_approved():
    called = {"handler_ran": False}

    async def _create_handler(ctx, args):
        called["handler_ran"] = True
        return ToolResult("created", summary="Created")

    provider = FakeProvider(
        rounds=[
            {"tool": "create_work_item", "input": {"title": "x"}, "id": "t3"},
            {"text": "done creating"},
        ]
    )
    on_usage, calls = _usage_tracker()
    registry = _make_registry(mutating_handler=_create_handler)

    events = [
        e
        async for e in run_agent(
            provider,
            system=[],
            messages=[],
            registry=registry,
            ctx=None,
            on_usage=on_usage,
            approved_tool_ids={"t3"},
        )
    ]

    assert called["handler_ran"] is True
    assert AgentToolResult("t3", "Created", False) in events
    assert any(isinstance(e, AgentText) and e.text == "done creating" for e in events)
    assert len(calls) == 2


def _batched_assistant_turn(*tool_use_ids: str) -> list[dict]:
    """A paused assistant turn whose content is several parallel create tool_use
    blocks — the shape `resume_agent` receives as `messages[-1]` after the model
    batched (e.g.) an epic + its stories into one turn."""
    return [
        {
            "role": "assistant",
            "content": [
                {"type": "tool_use", "id": tid, "name": "create_work_item", "input": {"title": tid}}
                for tid in tool_use_ids
            ],
        }
    ]


@pytest.mark.asyncio
async def test_resume_one_decision_approves_whole_batched_turn():
    """Approving the single confirmation must run EVERY mutating tool in the
    paused turn — not just the one the user clicked (the epic+stories bug)."""
    ran: list[str] = []

    async def _create_handler(ctx, args):
        ran.append(args["title"])
        return ToolResult(f"created {args['title']}", summary="Created")

    provider = FakeProvider(rounds=[{"text": "all created"}])
    on_usage, _ = _usage_tracker()
    registry = _make_registry(mutating_handler=_create_handler)
    messages = _batched_assistant_turn("t1", "t2", "t3")

    events = [
        e
        async for e in resume_agent(
            provider,
            system=[],
            messages=messages,
            registry=registry,
            ctx=None,
            on_usage=on_usage,
            decisions={"t1": True},  # UI only ever sends the one confirmed id
        )
    ]

    assert ran == ["t1", "t2", "t3"]  # all three ran, not just t1
    results = [e for e in events if isinstance(e, AgentToolResult)]
    assert [r.is_error for r in results] == [False, False, False]


@pytest.mark.asyncio
async def test_resume_cancel_declines_whole_batched_turn():
    """Cancelling must decline every mutating tool in the paused turn."""
    ran: list[str] = []

    async def _create_handler(ctx, args):
        ran.append(args["title"])
        return ToolResult("created", summary="Created")

    provider = FakeProvider(rounds=[{"text": "nothing created"}])
    on_usage, _ = _usage_tracker()
    registry = _make_registry(mutating_handler=_create_handler)
    messages = _batched_assistant_turn("t1", "t2", "t3")

    events = [
        e
        async for e in resume_agent(
            provider,
            system=[],
            messages=messages,
            registry=registry,
            ctx=None,
            on_usage=on_usage,
            decisions={"t1": False},
        )
    ]

    assert ran == []  # nothing ran
    results = [e for e in events if isinstance(e, AgentToolResult)]
    assert [r.is_error for r in results] == [True, True, True]


class _RecordingProvider:
    """Records the `tools` list passed each round; replays scripted rounds."""

    def __init__(self, rounds):
        self._rounds = list(rounds)
        self.tools_seen: list[list] = []

    async def stream_round(self, *, system, messages, tools, model=None):
        self.tools_seen.append(list(tools))
        r = self._rounds.pop(0)
        if "text" in r:
            yield RoundDelta(r["text"])
            yield RoundResult(
                assistant_content=[{"type": "text", "text": r["text"]}],
                stop_reason="end_turn", tool_uses=[], input_tokens=1, output_tokens=1,
            )
        else:
            yield RoundResult(
                assistant_content=[{"type": "tool_use", "id": r["id"], "name": r["tool"], "input": {}}],
                stop_reason="tool_use",
                tool_uses=[ToolUse(id=r["id"], name=r["tool"], input=r.get("input", {}))],
                input_tokens=1, output_tokens=1,
            )


@pytest.mark.asyncio
async def test_final_round_disables_tools_to_force_an_answer():
    """The last round runs with NO tools so the model must answer instead of dead-ending
    on 'reached the tool-call limit' (the max_rounds UX bug)."""
    provider = _RecordingProvider([
        {"tool": "query_work_items", "input": {}, "id": "t1"},  # round 1 uses a tool
        {"text": "Here is the final answer."},                  # round 2 (final) answers
    ])
    on_usage, _ = _usage_tracker()

    events = [
        e
        async for e in run_agent(
            provider, system=[], messages=[], registry=_make_registry(),
            ctx=None, on_usage=on_usage, max_rounds=2,
        )
    ]

    assert provider.tools_seen[0] != []   # first round had tools
    assert provider.tools_seen[1] == []   # final round had none -> forces synthesis
    texts = [e.text for e in events if isinstance(e, AgentText)]
    assert "Here is the final answer." in texts
    assert not any("reached the tool-call limit" in t for t in texts)


@pytest.mark.asyncio
async def test_runner_tool_that_never_returns_times_out(monkeypatch):
    """GIN-478: a handler that hangs (wedged DB/graph/index call) used to hold the
    SSE turn open with no terminal event — the client could only show an endless
    spinner. It must now be cut off and reported as a normal error result."""
    monkeypatch.setattr(settings, "agent_tool_timeout_s", 0.05)

    async def _hang(ctx, args):
        await asyncio.sleep(30)
        return ToolResult("never")

    registry = ToolRegistry([
        Tool(name="query_work_items", description="q",
             input_schema={"type": "object", "properties": {}},
             handler=_hang, mutating=False),
    ])
    provider = FakeProvider(rounds=[
        {"tool": "query_work_items", "input": {}, "id": "t1"},
        {"text": "recovered"},
    ])
    on_usage, _ = _usage_tracker()

    events = [
        e
        async for e in run_agent(
            provider, system=[], messages=[], registry=registry, ctx=None, on_usage=on_usage
        )
    ]

    errors = [e for e in events if isinstance(e, AgentToolResult) and e.is_error]
    assert errors and "timed out" in errors[0].summary
    assert any(isinstance(e, AgentText) and e.text == "recovered" for e in events)
