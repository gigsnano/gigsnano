"""Agent runner: drives the `while stop_reason == "tool_use"` loop with
confirm-before-write for mutating tools.

Provider stays thin (LLM I/O only); this module owns the loop, appending
assistant/tool_result turns to `messages` and calling tool handlers from a
`ToolRegistry`.
"""

import asyncio
import logging
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass

from gigsnano_api.agent.tools.base import Tool, ToolContext, ToolRegistry, ToolResult
from gigsnano_api.bmad.provider import LLMProvider, RoundDelta, RoundResult
from gigsnano_api.core.config import settings

logger = logging.getLogger(__name__)


async def _run_handler(
    tool: Tool, ctx: ToolContext, tool_input: dict, tool_use_id: str = "-"
) -> ToolResult:
    """Run a tool handler, converting any exception (e.g. a graph-query timeout) or an
    overrun of `agent_tool_timeout_s` into a graceful error result so one tool call can
    never crash / stall the whole agent turn. `tool_use_id` is the correlation id the
    client also sees, so a stuck call can be traced from the UI to this log line.
    Logs metadata only — never tool arguments (they carry prompt content)."""
    started = time.monotonic()
    try:
        result = await asyncio.wait_for(
            tool.handler(ctx, tool_input), timeout=settings.agent_tool_timeout_s
        )
    except Exception as exc:  # noqa: BLE001 - a tool bug/timeout must not kill the turn
        timed_out = isinstance(exc, asyncio.TimeoutError)
        logger.warning(
            "tool %s (%s) failed after %.1fs: %s",
            tool.name,
            tool_use_id,
            time.monotonic() - started,
            type(exc).__name__,
            exc_info=not timed_out,
        )
        detail = (
            f"timed out after {settings.agent_tool_timeout_s}s"
            if timed_out
            else f"failed ({type(exc).__name__})"
        )
        return ToolResult(
            f"The {tool.name} tool {detail}. Try a narrower query or a different approach.",
            is_error=True,
            summary=f"{tool.name} {'timed out' if timed_out else 'failed'}",
        )
    logger.info(
        "tool %s (%s) %s in %.1fs",
        tool.name,
        tool_use_id,
        "error" if result.is_error else "ok",
        time.monotonic() - started,
    )
    return result


@dataclass
class AgentText:
    text: str


@dataclass
class AgentToolCall:
    id: str
    name: str
    input: dict


@dataclass
class AgentToolResult:
    id: str
    summary: str
    is_error: bool
    link: str | None = None


@dataclass
class AgentToolConfirm:
    id: str
    name: str
    input: dict


@dataclass
class AgentSignal:
    name: str
    input: dict


AgentEvent = AgentText | AgentToolCall | AgentToolResult | AgentToolConfirm | AgentSignal


async def run_agent(
    provider: LLMProvider,
    *,
    system: list[dict],
    messages: list[dict],
    registry: ToolRegistry,
    ctx: ToolContext,
    on_usage: Callable[[int | None, int | None], Awaitable[None]],
    approved_tool_ids: set[str] | None = None,
    max_rounds: int | None = None,
    signal_tools: set[str] | None = None,
) -> AsyncIterator[AgentEvent]:
    approved = approved_tool_ids or set()
    tool_defs = registry.anthropic_defs()
    rounds = max_rounds if max_rounds is not None else settings.agent_max_rounds

    for i in range(rounds):
        # Reserve the final round for answering: with no tools the model must synthesize
        # from what it gathered rather than dead-ending on the tool-call limit.
        final_round = rounds > 1 and i == rounds - 1
        rr: RoundResult | None = None
        async for event in provider.stream_round(
            system=system, messages=messages, tools=[] if final_round else tool_defs
        ):
            if isinstance(event, RoundDelta):
                yield AgentText(event.text)
            else:
                rr = event

        assert rr is not None
        await on_usage(rr.input_tokens, rr.output_tokens)

        if rr.stop_reason != "tool_use":
            return

        messages.append({"role": "assistant", "content": rr.assistant_content})

        tool_results: list[dict] = []
        for tu in rr.tool_uses:
            yield AgentToolCall(tu.id, tu.name, tu.input)
            if tu.name in (signal_tools or set()):
                yield AgentSignal(tu.name, tu.input)
                return
            tool = registry.get(tu.name)
            if tool is None:
                result = ToolResult(f"Unknown tool: {tu.name}", is_error=True)
            elif tool.mutating and tu.id not in approved:
                yield AgentToolConfirm(tu.id, tu.name, tu.input)
                return
            else:
                result = await _run_handler(tool, ctx, tu.input, tu.id)

            yield AgentToolResult(
                tu.id, result.summary or result.content[:60], result.is_error, result.link
            )
            tool_results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": tu.id,
                    "content": result.content,
                    **({"is_error": True} if result.is_error else {}),
                }
            )

        messages.append({"role": "user", "content": tool_results})

    yield AgentText("(reached the tool-call limit; stopping.)")


async def resume_agent(
    provider: LLMProvider,
    *,
    system: list[dict],
    messages: list[dict],
    registry: ToolRegistry,
    ctx: ToolContext,
    on_usage: Callable[[int | None, int | None], Awaitable[None]],
    decisions: dict[str, bool],
    max_rounds: int | None = None,
) -> AsyncIterator[AgentEvent]:
    """Resume a turn paused by `AgentToolConfirm`.

    `messages[-1]` is the assistant turn whose content is the tool_use block(s)
    from the paused round (an Anthropic request is invalid unless every such
    block gets a matching tool_result in the following user turn). For each
    block: a mutating tool runs only if `decisions` approved its id, otherwise
    it gets a declined error result; a non-mutating tool (a read that happened
    to share the round) just runs — its result was never persisted, so it's
    re-executed here (idempotent). One user turn with all the results is
    appended, then the loop continues via `run_agent`.
    """
    last = messages[-1]
    tool_use_blocks = [b for b in last.get("content", []) if b.get("type") == "tool_use"]

    # The turn was paused on its FIRST unapproved mutating tool — `run_agent`
    # yields one `AgentToolConfirm` then returns — so the UI only ever surfaces a
    # single confirmation for the whole (possibly batched) turn. Apply that one
    # decision to every mutating block: an explicit per-id decision still wins
    # (forward-compatible if the UI ever sends several), but a block with no
    # decision of its own inherits the turn verdict. Without this, approving
    # "create a work item" ran the first create and silently declined the rest of
    # a parallel batch (e.g. an epic + its stories → epic created, stories lost).
    turn_approved = any(decisions.values())

    approved_ids: set[str] = set()
    tool_results: list[dict] = []
    for block in tool_use_blocks:
        tool_id = block["id"]
        tool = registry.get(block["name"])
        if tool is None:
            result = ToolResult(f"Unknown tool: {block['name']}", is_error=True)
        elif tool.mutating:
            if decisions.get(tool_id, turn_approved):
                approved_ids.add(tool_id)
                result = await _run_handler(tool, ctx, block["input"], tool_id)
            else:
                result = ToolResult("The user declined this action.", is_error=True)
        else:
            # Guarded like every other handler call: a read tool that shared the
            # paused round is RE-executed here, and an exception from it used to
            # escape the generator and kill the whole resumed turn — leaving the
            # approved write unrun and the client's spinner alive forever.
            result = await _run_handler(tool, ctx, block["input"], tool_id)

        yield AgentToolResult(
            tool_id, result.summary or result.content[:60], result.is_error, result.link
        )
        tool_results.append(
            {
                "type": "tool_result",
                "tool_use_id": tool_id,
                "content": result.content,
                **({"is_error": True} if result.is_error else {}),
            }
        )

    messages.append({"role": "user", "content": tool_results})

    async for event in run_agent(
        provider,
        system=system,
        messages=messages,
        registry=registry,
        ctx=ctx,
        on_usage=on_usage,
        approved_tool_ids=approved_ids,
        max_rounds=max_rounds,
    ):
        yield event
