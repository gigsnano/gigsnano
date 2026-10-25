"""GIN-148: a chat stream reports what it cost, as part of the stream.

Before this, the cost existed (record_llm_usage wrote it) but the client had to go
and ask for it with a separate fetch. Now the turn tells you.
"""

import json

from gigsnano_api.bmad.provider import FakeProvider
from gigsnano_api.llm.usage import usage_event_payload
from gigsnano_api.models import ELlmUsageOperation, LlmUsageEvent

CREATE_PROJECT = {
    "name": "Mobile App", "identifier": "MBA", "flow": "fresh",
    "cover_image_url": "https://img.test/c.jpg",
}


async def open_prd_thread(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    project = (await client.post("/api/workspaces/acme/projects/", json=CREATE_PROJECT)).json()
    stories = (
        await client.get(f"/api/workspaces/acme/projects/{project['id']}/sprint-zero/stories/")
    ).json()
    track = next(s for s in stories if s["bmad"]["workflow"] == "track-selection")
    await client.patch(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{track['id']}/",
        json={"status": "done"},
    )
    prd = next(s for s in stories if s["bmad"]["workflow"] == "bmad-prd")
    base = f"/api/workspaces/acme/projects/{project['id']}/stories/{prd['id']}"
    await client.post(f"{base}/thread/")
    return base


async def stream_events(client, url, content):
    events = []
    async with client.stream("POST", url, json={"content": content}) as res:
        assert res.status_code == 200
        async for line in res.aiter_lines():
            if line.startswith("data: ") and line != "data: [DONE]":
                events.append(json.loads(line[len("data: "):]))
    return events


# --- the payload --------------------------------------------------------------


def test_payload_carries_what_the_ticket_asks_for():
    event = LlmUsageEvent(
        operation=ELlmUsageOperation.STREAM_TURN,
        model="claude-opus-4-8",
        input_tokens=1000,
        output_tokens=500,
        total_tokens=1500,
        estimated_cost_usd=0.0123,
    )
    payload = usage_event_payload(event)
    assert payload["type"] == "data-usage"
    assert payload["operation"] == "stream_turn"
    assert payload["model"] == "claude-opus-4-8"
    assert payload["input_tokens"] == 1000
    assert payload["output_tokens"] == 500
    assert payload["cost_cents"] == 1.23  # dollars -> cents, 4dp


def test_a_free_call_reports_zero_not_null():
    # A fake call has no cost. `None` would make the client render "—" or crash on
    # arithmetic; 0 is the honest number.
    event = LlmUsageEvent(
        operation=ELlmUsageOperation.STREAM_TURN,
        model="fake",
        input_tokens=10,
        output_tokens=5,
        total_tokens=15,
        estimated_cost_usd=None,
    )
    assert usage_event_payload(event)["cost_cents"] == 0.0


def test_cents_convention_matches_the_rest_endpoint():
    """The live event and the REST poll describe the same money — they must not
    disagree about its shape. Both are floats rounded to 4dp."""
    from gigsnano_api.billing.ai_usage import _cents

    event = LlmUsageEvent(
        operation=ELlmUsageOperation.STREAM_TURN, model="m",
        input_tokens=1, output_tokens=1, total_tokens=2,
        estimated_cost_usd=0.000123456,
    )
    assert usage_event_payload(event)["cost_cents"] == _cents(0.000123456)


# --- through the real stream --------------------------------------------------


async def test_a_story_chat_turn_emits_its_cost(app, client):
    app.state.llm_provider = FakeProvider(turns=[("Let us define the PRD.", False)])
    base = await open_prd_thread(client)
    events = await stream_events(client, f"{base}/thread/messages/", "hello")

    usage = [e for e in events if e.get("type") == "data-usage"]
    assert len(usage) == 1, "a turn reports its cost exactly once"
    assert set(usage[0]) >= {
        "type", "operation", "model", "input_tokens", "output_tokens", "cost_cents",
    }
    assert usage[0]["operation"] == "stream_turn"


async def test_the_cost_arrives_before_the_stream_finishes(app, client):
    # Emitting after `finish` would mean the client has already torn the stream
    # down — the whole point is to avoid the follow-up fetch.
    app.state.llm_provider = FakeProvider(turns=[("ok", False)])
    base = await open_prd_thread(client)
    events = await stream_events(client, f"{base}/thread/messages/", "hello")
    types = [e.get("type") for e in events]
    assert "data-usage" in types
    assert types.index("data-usage") < types.index("finish")


async def test_a_fake_turn_still_reports_usage_at_zero(app, client):
    # Keyless dev runs on FakeProvider. The strip should read 0, not go blank.
    app.state.llm_provider = FakeProvider(turns=[("ok", False)])
    base = await open_prd_thread(client)
    events = await stream_events(client, f"{base}/thread/messages/", "hello")
    usage = next(e for e in events if e.get("type") == "data-usage")
    assert usage["cost_cents"] == 0.0
    assert usage["model"] == "fake"
