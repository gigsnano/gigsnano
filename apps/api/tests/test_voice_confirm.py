import json


async def setup(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": "ada@example.test", "password": "s3cret!"})
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    project = (await client.post("/api/workspaces/acme/projects/", json={
        "name": "Apollo", "identifier": "APO", "flow": "fresh",
        "cover_image_url": "https://img.test/c.jpg"})).json()
    agent_id = (await client.get("/api/workspaces/acme/agents/")).json()[0]["id"]
    session_id = (await client.post("/api/workspaces/acme/voice/sessions/",
                                    json={"locale": "en-US", "agent_profile_version": 1})
                  ).json()["session_id"]
    return session_id, agent_id, project["id"]


def _events(body: str) -> list[dict]:
    return [json.loads(line[6:]) for line in body.splitlines()
            if line.startswith("data: ") and line[6:].strip() != "[DONE]"]


def _stub_create(monkeypatch, project_id, title="Fix the header"):
    from gigsnano_api.features.voice import turn as turn_mod
    from gigsnano_api.voice.commands import EFieldState, EVoiceIntent, ResolvedField, VoiceCommand

    async def fake_extract(*_args, **_kwargs):
        return VoiceCommand(
            intent=EVoiceIntent.CREATE,
            tool="create_work_item",
            fields={
                "project": ResolvedField(state=EFieldState.RESOLVED, value=project_id),
                "title": ResolvedField(state=EFieldState.RESOLVED, value=title),
            },
        )

    monkeypatch.setattr(turn_mod, "extract_command", fake_extract)


async def test_a_write_turn_proposes_and_writes_nothing(client, monkeypatch):
    session_id, agent_id, project_id = await setup(client)
    _stub_create(monkeypatch, project_id)

    # Baseline before the turn: a fresh project auto-seeds its Sprint-0 stories,
    # so "nothing exists" isn't the right assertion -- "nothing NEW exists" is.
    before = (await client.get(f"/api/workspaces/acme/projects/{project_id}/stories/")).json()

    res = await client.post(f"/api/workspaces/acme/voice/sessions/{session_id}/turn/",
                            json={"transcript": "Create a work item called fix the header",
                                  "agent_id": agent_id, "project_id": project_id})
    events = _events(res.text)
    proposal = events[-1]
    assert proposal["type"] == "proposal"
    assert proposal["action"] == "create"
    assert proposal["hash"]

    # Nothing may be written until the user says yes.
    after = (await client.get(f"/api/workspaces/acme/projects/{project_id}/stories/")).json()
    assert after["total"] == before["total"]
    assert not any(s["title"] == "Fix the header" for s in after["items"])


async def test_confirming_the_offered_hash_applies_the_write(client, monkeypatch):
    session_id, agent_id, project_id = await setup(client)
    _stub_create(monkeypatch, project_id)

    res = await client.post(f"/api/workspaces/acme/voice/sessions/{session_id}/turn/",
                            json={"transcript": "Create a work item called fix the header",
                                  "agent_id": agent_id, "project_id": project_id})
    proposal_hash = _events(res.text)[-1]["hash"]

    receipt = await client.post(f"/api/workspaces/acme/voice/sessions/{session_id}/confirm/",
                                json={"hash": proposal_hash})
    assert receipt.status_code == 200
    assert receipt.json()["outcome"] == "applied"


async def test_confirm_response_puts_the_link_in_result_url_not_result_code(client, monkeypatch):
    """Regression for the field-name bug: `result_code` used to carry the deep
    link (`ToolResult.link`) while `result_code` should be an actual work-item
    code. `create_work_item` has no structured code field to draw from (only
    content/summary/link), so the honest fix leaves `result_code` empty rather
    than putting the link there or parsing prose -- `result_url` is where the
    link belongs."""
    session_id, agent_id, project_id = await setup(client)
    _stub_create(monkeypatch, project_id)

    res = await client.post(f"/api/workspaces/acme/voice/sessions/{session_id}/turn/",
                            json={"transcript": "Create a work item called fix the header",
                                  "agent_id": agent_id, "project_id": project_id})
    proposal_hash = _events(res.text)[-1]["hash"]

    receipt = await client.post(f"/api/workspaces/acme/voice/sessions/{session_id}/confirm/",
                                json={"hash": proposal_hash})
    body = receipt.json()
    assert body["outcome"] == "applied"
    assert body["result_code"] == ""
    assert body["result_url"].startswith(f"/acme/projects/{project_id}/issues/")


async def test_a_hash_that_was_never_offered_is_refused(client, monkeypatch):
    session_id, agent_id, project_id = await setup(client)
    _stub_create(monkeypatch, project_id)
    await client.post(f"/api/workspaces/acme/voice/sessions/{session_id}/turn/",
                      json={"transcript": "Create a work item called fix the header",
                            "agent_id": agent_id, "project_id": project_id})

    # The binding is the point: a "yes" for one write must never apply another.
    res = await client.post(f"/api/workspaces/acme/voice/sessions/{session_id}/confirm/",
                            json={"hash": "0" * 32})
    assert res.status_code == 409


async def test_confirming_twice_does_not_write_twice(client, monkeypatch):
    session_id, agent_id, project_id = await setup(client)
    _stub_create(monkeypatch, project_id)
    res = await client.post(f"/api/workspaces/acme/voice/sessions/{session_id}/turn/",
                            json={"transcript": "Create a work item called fix the header",
                                  "agent_id": agent_id, "project_id": project_id})
    proposal_hash = _events(res.text)[-1]["hash"]

    first = await client.post(f"/api/workspaces/acme/voice/sessions/{session_id}/confirm/",
                              json={"hash": proposal_hash})
    second = await client.post(f"/api/workspaces/acme/voice/sessions/{session_id}/confirm/",
                               json={"hash": proposal_hash})
    assert first.status_code == 200
    # A dropped connection inside one session is one bug report, not two.
    assert second.status_code == 409 or second.json()["outcome"] == "deduplicated"


async def test_confirm_with_no_pending_proposal_is_refused(client):
    session_id, _, _ = await setup(client)
    res = await client.post(f"/api/workspaces/acme/voice/sessions/{session_id}/confirm/",
                            json={"hash": "0" * 32})
    assert res.status_code == 409


async def test_a_stale_proposal_is_refused_not_silently_applied(client, monkeypatch):
    """write.Confirmation's own TTL check is measured against itself inside
    apply_proposal (mint-then-authorise in one call) and can never fire -- the
    real clock is how long the proposal sat in record.pending. Back-date
    created_at instead of sleeping 180s; it isn't part of the hash, so the
    already-offered hash is unchanged."""
    from datetime import timedelta

    from gigsnano_api.features.voice import service as S
    from gigsnano_api.features.voice import write as write_mod

    session_id, agent_id, project_id = await setup(client)
    _stub_create(monkeypatch, project_id)
    res = await client.post(f"/api/workspaces/acme/voice/sessions/{session_id}/turn/",
                            json={"transcript": "Create a work item called fix the header",
                                  "agent_id": agent_id, "project_id": project_id})
    proposal_hash = _events(res.text)[-1]["hash"]

    record = S.get(session_id)
    proposal, _command, _agent_id = record.pending
    proposal.created_at -= timedelta(seconds=write_mod.CONFIRMATION_TTL_SECONDS + 1)

    res = await client.post(f"/api/workspaces/acme/voice/sessions/{session_id}/confirm/",
                            json={"hash": proposal_hash})
    assert res.status_code == 409

    items = (await client.get(f"/api/workspaces/acme/projects/{project_id}/stories/")).json()
    assert not any(s["title"] == "Fix the header" for s in items["items"])


async def test_a_replayed_confirm_is_deduplicated_not_a_second_write(client, monkeypatch):
    """A dropped connection and an honest restatement of the same intent are
    indistinguishable from the server's side: both produce a proposal with the
    same content hash (created_at isn't part of it), and both must resolve to
    exactly one write."""
    session_id, agent_id, project_id = await setup(client)
    _stub_create(monkeypatch, project_id)

    first_turn = await client.post(f"/api/workspaces/acme/voice/sessions/{session_id}/turn/",
                                   json={"transcript": "Create a work item called fix the header",
                                         "agent_id": agent_id, "project_id": project_id})
    first_hash = _events(first_turn.text)[-1]["hash"]
    first_confirm = await client.post(f"/api/workspaces/acme/voice/sessions/{session_id}/confirm/",
                                      json={"hash": first_hash})
    assert first_confirm.json()["outcome"] == "applied"

    second_turn = await client.post(f"/api/workspaces/acme/voice/sessions/{session_id}/turn/",
                                    json={"transcript": "Create a work item called fix the header",
                                          "agent_id": agent_id, "project_id": project_id})
    second_hash = _events(second_turn.text)[-1]["hash"]
    assert second_hash == first_hash  # same content, same key -- the point of the test

    second_confirm = await client.post(f"/api/workspaces/acme/voice/sessions/{session_id}/confirm/",
                                       json={"hash": second_hash})
    assert second_confirm.status_code == 200
    assert second_confirm.json()["outcome"] == "deduplicated"

    items = (await client.get(f"/api/workspaces/acme/projects/{project_id}/stories/")).json()
    assert sum(1 for s in items["items"] if s["title"] == "Fix the header") == 1


async def test_a_confirm_from_a_different_actor_is_refused(client):
    """Enforced upstream today (service.require_live rejects a mismatched actor
    before the record is even returned to the route) -- this documents the
    property rather than the mechanism, so a regression there is caught here
    too rather than only in the session-broker's own tests."""
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Bob", "email": "bob@example.test", "password": "s3cret!"})
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": "ada@example.test", "password": "s3cret!"})
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    bob_ws = (await client.post("/api/workspaces/acme/members/",
                                json={"email": "bob@example.test"})).json()
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-in/", json={"email": "bob@example.test", "password": "s3cret!"})
    await client.patch(f"/api/workspaces/acme/members/{bob_ws['id']}/", json={"accept": True})
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-in/", json={"email": "ada@example.test", "password": "s3cret!"})

    session_id = (await client.post("/api/workspaces/acme/voice/sessions/",
                                    json={"locale": "en-US", "agent_profile_version": 1})
                  ).json()["session_id"]

    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-in/", json={"email": "bob@example.test", "password": "s3cret!"})
    res = await client.post(f"/api/workspaces/acme/voice/sessions/{session_id}/confirm/",
                            json={"hash": "0" * 32})
    assert res.status_code == 404
