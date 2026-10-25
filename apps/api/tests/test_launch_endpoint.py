"""Launch endpoint + completion-gate endpoint wiring (GIN-342, slice 2). The
control-plane "Accept & run": apply the stored Execution Profile and delegate to a
connected agent with the pinned skills injected into its prompt."""

import pytest

from gigsnano_api.features.execution_profiles import service as ep
from gigsnano_api.features.skills.seed import seed_skills
from gigsnano_api.models import Project, Story


async def _project_and_story(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    project = (await client.post("/api/workspaces/acme/projects/", json={
        "name": "App", "identifier": "APP", "flow": "fresh",
        "cover_image_url": "https://img.test/c.jpg",
    })).json()
    stories = (await client.get(
        f"/api/workspaces/acme/projects/{project['id']}/sprint-zero/stories/"
    )).json()
    return project["id"], stories[0]["id"]


async def _connect_cursor(client, monkeypatch):
    async def _fake_verify(_key: str):
        return {"email": "ada@example.test"}

    monkeypatch.setattr(
        "gigsnano_api.agent_delegation.router.verify_cursor_api_key", _fake_verify
    )
    res = await client.post(
        "/api/agents/connections/cursor/connect/", json={"api_key": "cursor_test_key"}
    )
    assert res.status_code == 200
    return res.json()["id"]


async def _persist_profile(db_session, project_id, story_id):
    """Seed the registry + persist a claude-code profile for the sprint-zero story,
    on the same engine the app's sessions use."""
    project = await db_session.get(Project, project_id)
    await seed_skills(db_session)
    story = await db_session.get(Story, story_id)
    await ep.resolve_and_persist(db_session, story, project.workspace_id, story.title, "claude-code")
    await db_session.commit()


@pytest.mark.asyncio
async def test_launch_applies_profile_and_delegates(client, db_session, monkeypatch):
    from gigsnano_api.agent_delegation import router as agent_router
    from gigsnano_api.agent_delegation.provider import FakeAgentProvider

    monkeypatch.setattr(agent_router, "resolve_agent_provider", lambda *a, **k: FakeAgentProvider())
    project_id, story_id = await _project_and_story(client)
    conn_id = await _connect_cursor(client, monkeypatch)
    await _persist_profile(db_session, project_id, story_id)
    base = f"/api/workspaces/acme/projects/{project_id}"

    res = await client.post(
        f"{base}/stories/{story_id}/launch/", json={"connection_id": conn_id}
    )
    assert res.status_code == 201, res.text
    out = res.json()
    assert out["run_id"]
    assert out["agent"] == "claude-code"
    assert "verification-gate" in out["required"]

    # The pinned skills reach the remote agent via the delegation's custom_prompt,
    # with the task appended after the skill preamble.
    prompt = out["delegation"]["custom_prompt"]
    assert "Active skills for this run" in prompt
    assert "# Task" in prompt

    # The telemetry run exists and recorded RESOLVED skill-events.
    events = (await client.get(f"{base}/stories/{story_id}/runs/{out['run_id']}/skill-events/")).json()
    assert any(
        e["skill_id"] == "verification-gate" and e["state"] == "resolved"
        for e in events["events"]
    )


@pytest.mark.asyncio
async def test_launch_refuses_without_profile(client, monkeypatch):
    from gigsnano_api.agent_delegation import router as agent_router
    from gigsnano_api.agent_delegation.provider import FakeAgentProvider

    monkeypatch.setattr(agent_router, "resolve_agent_provider", lambda *a, **k: FakeAgentProvider())
    project_id, story_id = await _project_and_story(client)
    conn_id = await _connect_cursor(client, monkeypatch)
    base = f"/api/workspaces/acme/projects/{project_id}"

    # No profile resolved → 409, and no delegation is created.
    res = await client.post(f"{base}/stories/{story_id}/launch/", json={"connection_id": conn_id})
    assert res.status_code == 409
    assert "execution profile" in res.json()["detail"]


@pytest.mark.asyncio
async def test_launch_rejects_missing_connection(client, db_session, monkeypatch):
    from gigsnano_api.agent_delegation import router as agent_router
    from gigsnano_api.agent_delegation.provider import FakeAgentProvider

    monkeypatch.setattr(agent_router, "resolve_agent_provider", lambda *a, **k: FakeAgentProvider())
    project_id, story_id = await _project_and_story(client)
    await _persist_profile(db_session, project_id, story_id)
    base = f"/api/workspaces/acme/projects/{project_id}"

    res = await client.post(f"{base}/stories/{story_id}/launch/", json={"connection_id": "nope"})
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_completion_gate_endpoint_surfaces_unverified(client, db_session, monkeypatch):
    from gigsnano_api.agent_delegation import router as agent_router
    from gigsnano_api.agent_delegation.provider import FakeAgentProvider

    monkeypatch.setattr(agent_router, "resolve_agent_provider", lambda *a, **k: FakeAgentProvider())
    project_id, story_id = await _project_and_story(client)
    conn_id = await _connect_cursor(client, monkeypatch)
    await _persist_profile(db_session, project_id, story_id)
    base = f"/api/workspaces/acme/projects/{project_id}"

    # Before any run: nothing to gate → passed.
    gate = (await client.get(f"{base}/stories/{story_id}/completion-gate/")).json()
    assert gate["passed"] is True and gate["run_id"] is None

    # Launch creates a run whose required skills are unverified → surfaced, not blocked.
    await client.post(f"{base}/stories/{story_id}/launch/", json={"connection_id": conn_id})
    gate = (await client.get(f"{base}/stories/{story_id}/completion-gate/")).json()
    assert gate["passed"] is False
    assert "verification-gate" in gate["missing"]
