import pytest

from gigsnano_api.bmad.provider import FakeProvider
from gigsnano_api.features.experts.orchestrator import (
    RoomSpeaker,
    RoomText,
    RoomTurnEnd,
    render_transcript,
    run_room_round,
)
from gigsnano_api.features.experts.registry import Expert


def _name(speaker):
    return {"agent_analyst": "Analyst · Mary", "agent_architect": "Architect · Winston"}.get(
        speaker, "You"
    )


def test_render_transcript_labels_each_line_by_speaker():
    messages = [
        {"speaker": None, "content": "we need a dashboard"},
        {"speaker": "agent_analyst", "content": "core need is customization"},
        {"speaker": "agent_architect", "content": "nail layout persistence first"},
    ]
    text = render_transcript(messages, _name)
    assert text == (
        "You: we need a dashboard\n"
        "Analyst · Mary: core need is customization\n"
        "Architect · Winston: nail layout persistence first"
    )


def test_render_transcript_empty_is_empty_string():
    assert render_transcript([], _name) == ""


_A = Expert("agent_analyst", "Analyst · Mary", "Mary", "software", "You are Mary.", "#3b6ea5")
_W = Expert("agent_architect", "Architect · Winston", "Winston", "software", "You are Winston.", "#c2792e")


def _build_system(expert, others):
    return [{"type": "text", "text": expert.system_prompt}]


@pytest.mark.asyncio
async def test_one_round_visits_each_participant_once_in_order():
    provider = FakeProvider(rounds=[{"text": "Mary take"}, {"text": "Winston take"}])
    transcript = [{"speaker": None, "content": "kick off"}]
    events = [
        e
        async for e in run_room_round(
            provider,
            participants=[_A, _W],
            transcript=transcript,
            build_system=_build_system,
            speaker_name=_name,
        )
    ]
    speakers = [e.id for e in events if isinstance(e, RoomSpeaker)]
    assert speakers == ["agent_analyst", "agent_architect"]  # round-robin order
    texts = [(e.speaker_id, e.text) for e in events if isinstance(e, RoomText)]
    assert texts == [("agent_analyst", "Mary take"), ("agent_architect", "Winston take")]
    ends = [e.speaker_id for e in events if isinstance(e, RoomTurnEnd)]
    assert ends == ["agent_analyst", "agent_architect"]  # each turn ended → pause after one round


@pytest.mark.asyncio
async def test_single_participant_round_is_one_turn():
    provider = FakeProvider(rounds=[{"text": "solo"}])
    events = [
        e
        async for e in run_room_round(
            provider, participants=[_A], transcript=[], build_system=_build_system, speaker_name=_name
        )
    ]
    assert [e.speaker_id for e in events if isinstance(e, RoomText)] == ["agent_analyst"]
