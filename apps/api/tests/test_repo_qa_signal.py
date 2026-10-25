"""Test for Task C1 (SP3): run_agent signal tools — a signal tool is announced
via AgentSignal and terminates the loop WITHOUT executing its handler."""

import pytest

from gigsnano_api.agent.runner import AgentSignal, AgentText, run_agent
from gigsnano_api.agent.tools.base import Tool, ToolRegistry
from gigsnano_api.bmad.provider import FakeProvider, RoundDelta, RoundResult, ToolUse


class _Script(FakeProvider):
    def __init__(self, rounds):
        self._rounds = rounds
        self._i = 0

    async def stream_round(self, *, system, messages, tools, model=None):
        r = self._rounds[self._i]
        self._i += 1
        if r.get("text"):
            yield RoundDelta(r["text"])
        yield RoundResult(
            assistant_content=r.get("assistant", []),
            stop_reason=r["stop"],
            tool_uses=r.get("tool_uses", []),
            input_tokens=1,
            output_tokens=1,
        )


async def _noop(a, b):
    return None


@pytest.mark.asyncio
async def test_signal_tool_stops_and_signals():
    async def _never_called(ctx, args):
        raise AssertionError("signal tool handler must never execute")

    finalize = Tool(
        "propose_finalize", "signal", {"type": "object", "properties": {}}, _never_called, False
    )
    reg = ToolRegistry([finalize])
    provider = _Script(
        [
            {
                "text": "Looks ready.",
                "stop": "tool_use",
                "assistant": [
                    {"type": "tool_use", "id": "t1", "name": "propose_finalize", "input": {}}
                ],
                "tool_uses": [ToolUse(id="t1", name="propose_finalize", input={})],
            },
        ]
    )
    events = [
        e
        async for e in run_agent(
            provider,
            system=[],
            messages=[{"role": "user", "content": "done?"}],
            registry=reg,
            ctx=None,
            on_usage=_noop,
            signal_tools={"propose_finalize"},
        )
    ]
    assert any(isinstance(e, AgentSignal) and e.name == "propose_finalize" for e in events)
    assert any(isinstance(e, AgentText) for e in events)
