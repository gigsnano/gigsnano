"""Expert Room orchestrator — round-robin advisory turns over a shared transcript.

Mirrors agent/runner.py's event-generator shape, but every turn is TEXT-ONLY
(no tools) and there is one round per burst. The router maps the yielded events
to SSE + persistence."""

from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass

from gigsnano_api.bmad.provider import LLMProvider, RoundDelta, RoundResult
from gigsnano_api.features.experts.registry import Expert


def render_transcript(
    messages: list[dict], speaker_name: Callable[[str | None], str]
) -> str:
    """The conversation so far as one labelled block: "Name: text" per line."""
    return "\n".join(
        f"{speaker_name(m.get('speaker'))}: {m['content']}" for m in messages
    )


@dataclass
class RoomSpeaker:
    id: str
    name: str
    color: str


@dataclass
class RoomText:
    speaker_id: str
    text: str


@dataclass
class RoomTurnEnd:
    speaker_id: str
    input_tokens: int | None
    output_tokens: int | None


RoomEvent = RoomSpeaker | RoomText | RoomTurnEnd


async def run_room_round(
    provider: LLMProvider,
    *,
    participants: list[Expert],
    transcript: list[dict],
    build_system: Callable[[Expert, list[Expert]], list[dict]],
    speaker_name: Callable[[str | None], str],
) -> AsyncIterator[RoomEvent]:
    """One round-robin round: each participant speaks once, in list order.

    Advisory-only — a fresh TEXT completion per expert over the shared transcript
    rendered as a single user turn (no tools). Each expert's message is appended
    to `transcript` in memory so later speakers in the SAME round see it. The
    caller persists messages + streams these events to SSE."""
    working = list(transcript)
    for expert in participants:
        others = [p for p in participants if p.id != expert.id]
        yield RoomSpeaker(id=expert.id, name=expert.name, color=expert.avatar_color)

        convo = render_transcript(working, speaker_name)
        others_line = (
            f"You are in a group discussion with: {', '.join(o.name for o in others)}. "
            if others
            else ""
        )
        user_turn = (
            f"{others_line}Conversation so far:\n{convo}\n\nRespond as {expert.name}."
            if convo
            else f"{others_line}Start the discussion as {expert.name}."
        )

        chunks: list[str] = []
        rr: RoundResult | None = None
        async for event in provider.stream_round(
            system=build_system(expert, others),
            messages=[{"role": "user", "content": user_turn}],
            tools=[],
        ):
            if isinstance(event, RoundDelta):
                chunks.append(event.text)
                yield RoomText(speaker_id=expert.id, text=event.text)
            else:
                rr = event
        assert rr is not None

        working.append({"speaker": expert.id, "content": "".join(chunks)})
        yield RoomTurnEnd(
            speaker_id=expert.id,
            input_tokens=rr.input_tokens,
            output_tokens=rr.output_tokens,
        )
