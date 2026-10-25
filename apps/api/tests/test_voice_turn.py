import json


async def setup(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": "ada@example.test", "password": "s3cret!"})
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    agents = (await client.get("/api/workspaces/acme/agents/")).json()
    session_id = (await client.post("/api/workspaces/acme/voice/sessions/",
                                    json={"locale": "en-US", "agent_profile_version": 1})
                  ).json()["session_id"]
    return session_id, agents[0]["id"]


def _events(body: str) -> list[dict]:
    return [json.loads(line[6:]) for line in body.splitlines()
            if line.startswith("data: ") and line[6:].strip() != "[DONE]"]


async def turn(client, session_id, agent_id, transcript):
    res = await client.post(f"/api/workspaces/acme/voice/sessions/{session_id}/turn/",
                            json={"transcript": transcript, "agent_id": agent_id})
    assert res.status_code == 200
    return _events(res.text)


async def create_project(client, name, identifier):
    res = await client.post("/api/workspaces/acme/projects/", json={
        "name": name, "identifier": identifier, "flow": "fresh",
        "cover_image_url": "https://img.test/c.jpg"})
    return res.json()["id"]


async def test_a_read_turn_speaks_a_narrated_answer(client):
    session_id, agent_id = await setup(client)
    events = await turn(client, session_id, agent_id, "What is on my plate?")

    assert [e["type"] for e in events if e["type"] == "text"], "the agent must say something"
    assert events[-1]["type"] in {"receipt", "clarification", "error"}
    # A read must never claim to have written.
    assert not any(e["type"] == "proposal" for e in events)


async def test_exactly_one_terminal_event_ends_a_turn(client):
    session_id, agent_id = await setup(client)
    events = await turn(client, session_id, agent_id, "What is on my plate?")
    terminal = [e for e in events if e["type"] in {"receipt", "clarification", "proposal", "error"}]
    assert len(terminal) == 1
    assert events[-1] is terminal[0]


async def test_a_material_write_does_not_silently_succeed(client, monkeypatch):
    """Task 8 routed reads only, leaving material writes an honest gap. Task 14
    closes it with a proposal — the write still must never look like a receipt,
    since that would report an application that never happened."""
    from gigsnano_api.features.voice import turn as turn_mod
    from gigsnano_api.voice.commands import EFieldState, EVoiceIntent, ResolvedField, VoiceCommand

    async def fake_extract(*_args, **_kwargs):
        return VoiceCommand(
            intent=EVoiceIntent.CREATE,
            tool="create_work_item",
            fields={
                "project": ResolvedField(state=EFieldState.RESOLVED, value="p1"),
                "title": ResolvedField(state=EFieldState.RESOLVED, value="Fix the header"),
            },
        )

    monkeypatch.setattr(turn_mod, "extract_command", fake_extract)
    session_id, agent_id = await setup(client)
    events = await turn(client, session_id, agent_id, "Create a work item called fix the header")

    assert events[-1]["type"] == "proposal"
    assert events[-1]["action"] == "create"
    assert not any(e["type"] == "receipt" for e in events)


async def test_a_spoken_assignee_on_create_is_refused_not_silently_dropped(client, monkeypatch):
    """CREATE_FIELDS doesn't include `assignee` (create_work_item never accepted
    it). A user saying 'assign it to Divya' must not get a proposal that quietly
    omits the assignee while still saying 'Shall I?' -- that is precisely the
    voice/commands.py docstring's 'assign to Divya becomes assign to nobody'
    failure. The whole proposal must refuse, naming the field, not silently
    build one without it."""
    from gigsnano_api.features.voice import turn as turn_mod
    from gigsnano_api.voice.commands import EFieldState, EVoiceIntent, ResolvedField, VoiceCommand

    async def fake_extract(*_args, **_kwargs):
        return VoiceCommand(
            intent=EVoiceIntent.CREATE,
            tool="create_work_item",
            fields={
                "project": ResolvedField(state=EFieldState.RESOLVED, value="p1"),
                "title": ResolvedField(state=EFieldState.RESOLVED, value="Fix the header"),
                "assignee": ResolvedField(state=EFieldState.RESOLVED, value="Divya"),
            },
        )

    monkeypatch.setattr(turn_mod, "extract_command", fake_extract)
    session_id, agent_id = await setup(client)
    events = await turn(
        client, session_id, agent_id, "Create a task called fix the header and assign it to Divya"
    )

    # Never a proposal (which would say "Shall I?" over a write missing the
    # assignee), and never a receipt (nothing was written at all).
    assert not any(e["type"] == "proposal" for e in events)
    assert not any(e["type"] == "receipt" for e in events)
    assert events[-1] == {"type": "error", "code": "proposal_rejected", "retryable": False}
    spoken = " ".join(e["text"] for e in events if e["type"] == "text")
    assert "assignee" in spoken.lower()


async def test_an_unsupported_intent_is_blocked_and_spoken(client, monkeypatch):
    from gigsnano_api.features.voice import turn as turn_mod
    from gigsnano_api.voice.commands import EVoiceIntent, VoiceCommand

    async def fake_extract(*_args, **_kwargs):
        return VoiceCommand(intent=EVoiceIntent.UNSUPPORTED)

    monkeypatch.setattr(turn_mod, "extract_command", fake_extract)
    session_id, agent_id = await setup(client)
    events = await turn(client, session_id, agent_id, "Delete every work item")

    assert any(e["type"] == "text" for e in events), "a refusal must be spoken, not silent"
    assert events[-1] == {"type": "error", "code": "blocked", "retryable": False}


async def test_unparseable_model_output_asks_the_user_to_repeat(client, monkeypatch):
    from gigsnano_api.features.voice import turn as turn_mod
    from gigsnano_api.voice.commands import SchemaRejected

    async def fake_extract(*_args, **_kwargs):
        raise SchemaRejected("not a command")

    monkeypatch.setattr(turn_mod, "extract_command", fake_extract)
    session_id, agent_id = await setup(client)
    events = await turn(client, session_id, agent_id, "mumble mumble")

    assert any(e["type"] == "text" for e in events)
    assert events[-1]["type"] == "error"
    assert events[-1]["retryable"] is True


async def test_turn_requires_a_known_agent(client):
    session_id, _ = await setup(client)
    res = await client.post(f"/api/workspaces/acme/voice/sessions/{session_id}/turn/",
                            json={"transcript": "hello", "agent_id": "nope"})
    assert res.status_code == 404


async def test_empty_transcript_spends_no_turn(client):
    session_id, agent_id = await setup(client)
    res = await client.post(f"/api/workspaces/acme/voice/sessions/{session_id}/turn/",
                            json={"transcript": "  ", "agent_id": agent_id})
    assert res.status_code == 400


async def test_a_spoken_project_name_resolves_before_the_read_runs(client, monkeypatch):
    """The model only ever hands back a phrase ("Apollo"), never a real id.
    Something has to turn that phrase into the project the read actually scopes
    to -- otherwise it silently answers about whatever project happened to
    already be in scope, which is the exact bug this test guards against.

    `read.run` is stubbed to capture the query it actually receives: every
    fresh project seeds an identical 10-story Sprint-0, so the story *count*
    can't distinguish "resolved to Apollo" from "fell back to whatever was
    already in scope" -- the query's project_id can.
    """
    from gigsnano_api.features.voice import read as read_mod
    from gigsnano_api.features.voice import turn as turn_mod
    from gigsnano_api.voice.commands import EFieldState, EVoiceIntent, ResolvedField, VoiceCommand

    session_id, agent_id = await setup(client)
    apollo_id = await create_project(client, "Apollo", "APL")

    async def fake_extract(*_args, **_kwargs):
        return VoiceCommand(
            intent=EVoiceIntent.READ,
            fields={"project": ResolvedField(state=EFieldState.RESOLVED, value="Apollo")},
        )

    captured = {}

    async def fake_run(db, ctx, query):
        captured["project_id"] = query.project_id
        return read_mod.ReadResult(query=query, total=0)

    monkeypatch.setattr(turn_mod, "extract_command", fake_extract)
    monkeypatch.setattr(turn_mod.read, "run", fake_run)
    events = await turn(client, session_id, agent_id, "How is Apollo doing?")

    assert events[-1]["type"] == "receipt"
    assert captured["project_id"] == apollo_id


async def test_an_ambiguous_project_name_asks_which_one(client, monkeypatch):
    from gigsnano_api.features.voice import turn as turn_mod
    from gigsnano_api.voice.commands import EFieldState, EVoiceIntent, ResolvedField, VoiceCommand

    session_id, agent_id = await setup(client)
    await create_project(client, "Apollo", "APL")
    await create_project(client, "Apollo", "AP2")  # same name, different project

    async def fake_extract(*_args, **_kwargs):
        return VoiceCommand(
            intent=EVoiceIntent.READ,
            fields={"project": ResolvedField(state=EFieldState.RESOLVED, value="Apollo")},
        )

    monkeypatch.setattr(turn_mod, "extract_command", fake_extract)
    events = await turn(client, session_id, agent_id, "How is Apollo doing?")

    assert events[-1]["type"] == "clarification"
    assert events[-1]["field"] == "project"
    assert len(events[-1]["candidates"]) == 2
    assert not any(e["type"] == "receipt" for e in events)


async def test_an_agent_without_the_work_items_bundle_is_refused(client, monkeypatch):
    """Bundles are what an owner composes an agent from. An agent scoped to
    spend_time only must not be able to read work items just because some
    other agent in the roster can -- otherwise composing bundles constrains
    nothing on a call."""
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": "ada@example.test", "password": "s3cret!"})
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    finance_agent = (await client.post("/api/workspaces/acme/agents/", json={
        "name": "Finance", "persona": "finance", "bundles": ["spend_time"],
    })).json()
    session_id = (await client.post("/api/workspaces/acme/voice/sessions/",
                                    json={"locale": "en-US", "agent_profile_version": 1})
                  ).json()["session_id"]

    events = await turn(client, session_id, finance_agent["id"], "What is on my plate?")

    assert events[-1] == {"type": "error", "code": "not_permitted", "retryable": False}
    assert any(e["type"] == "text" for e in events)
    assert not any(e["type"] == "receipt" for e in events)


async def custom_agent(client, name, bundles):
    """A fresh workspace plus one owner-composed agent, for the bundle tests."""
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": "ada@example.test", "password": "s3cret!"})
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    agent = (await client.post("/api/workspaces/acme/agents/", json={
        "name": name, "persona": name.lower(), "bundles": bundles})).json()
    session_id = (await client.post("/api/workspaces/acme/voice/sessions/",
                                    json={"locale": "en-US", "agent_profile_version": 1})
                  ).json()["session_id"]
    return session_id, agent["id"]


def _read_command(tool):
    from gigsnano_api.voice.commands import EVoiceIntent, VoiceCommand

    async def fake_extract(*_args, **_kwargs):
        return VoiceCommand(intent=EVoiceIntent.READ, tool=tool)

    return fake_extract


async def test_a_workspace_wide_agent_can_take_a_turn(client):
    """C1. All seven seeded agents are workspace-wide, so `agent.project_id` is
    JSON null and the call screen posts it straight through. A `str` field with
    extra="forbid" turned that into a 422 on the FIRST utterance of every call --
    the whole feature dead before any of it ran."""
    session_id, agent_id = await setup(client)
    roster = (await client.get("/api/workspaces/acme/agents/")).json()
    assert roster[0]["project_id"] is None, "the seeded roster is workspace-wide"

    res = await client.post(f"/api/workspaces/acme/voice/sessions/{session_id}/turn/",
                            json={"transcript": "What is on my plate?",
                                  "agent_id": agent_id, "project_id": None})
    assert res.status_code == 200, res.text
    assert _events(res.text)[-1]["type"] in {"receipt", "clarification", "error"}


async def test_a_spend_agent_answers_a_spend_question(client, monkeypatch):
    """C3. The read branch used to gate on `query_work_items` and then call
    `read.run` directly, so an agent composed from `spend_time` -- the spec's own
    Finance example -- was risk_blocked on every utterance and both spend tools
    were dead on all production paths. Reads now dispatch through the agent's own
    intersected registry."""
    from gigsnano_api.features.voice import turn as turn_mod

    session_id, agent_id = await custom_agent(client, "Finance", ["spend_time"])
    monkeypatch.setattr(turn_mod, "extract_command", _read_command("ai_spend_summary"))
    events = await turn(client, session_id, agent_id, "What have we spent on AI?")

    assert any(e["type"] == "tool" and e["name"] == "ai_spend_summary" for e in events)
    assert any("USD" in e.get("text", "") for e in events if e["type"] == "text")
    assert events[-1] == {"type": "receipt", "outcome": "applied", "code": "", "url": ""}


async def test_a_health_agent_answers_a_health_question(client, monkeypatch):
    """C3, the other dead bundle. No project is in scope here, so the tool's own
    refusal is the answer -- what matters is that it was reached and spoke, not
    refused by the bundle gate before it ever ran."""
    from gigsnano_api.features.voice import turn as turn_mod

    session_id, agent_id = await custom_agent(client, "Delivery", ["project_health"])
    monkeypatch.setattr(turn_mod, "extract_command", _read_command("project_health_summary"))
    events = await turn(client, session_id, agent_id, "How is it tracking?")

    assert any(e["type"] == "tool" and e["name"] == "project_health_summary" for e in events)
    assert events[-1]["type"] == "receipt"


async def test_an_agent_cannot_reach_a_tool_outside_its_bundles(client, monkeypatch):
    """The governance property C3 must not have widened: effective tools stay
    `union(agent.bundles) INTERSECT ALLOWED_TOOLS`. A work-items agent naming a
    spend tool is refused, however plausible the tool name is."""
    from gigsnano_api.features.voice import turn as turn_mod

    session_id, agent_id = await custom_agent(client, "Scribe", ["work_items"])
    monkeypatch.setattr(turn_mod, "extract_command", _read_command("ai_spend_summary"))
    events = await turn(client, session_id, agent_id, "What have we spent on AI?")

    assert events[-1] == {"type": "error", "code": "not_permitted", "retryable": False}
    assert not any(e["type"] == "tool" for e in events)
