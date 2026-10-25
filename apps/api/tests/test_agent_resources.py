import pytest

from gigsnano_api.features.agent_runs import resources, service
from gigsnano_api.models.stories import Story


async def _story(db, project):
    s = Story(project_id=project.id, title="T", story_number=1)
    db.add(s)
    await db.flush()
    return s


async def test_roster_exposed_as_resources(db_session, make_project):
    project = await make_project()
    res = await resources.agent_resources(db_session, project.workspace_id)
    dev = next(r for r in res if r["id"] == "agent_dev")
    assert dev["capacity"] == resources.PERSONA_CAPACITY
    assert dev["active_load"] == 0
    assert dev["skills"]  # workflows surfaced as skills


async def test_load_and_cost_aggregate(db_session, make_project):
    project = await make_project()
    story = await _story(db_session, project)
    run = await service.create_run(db_session, story_id=story.id, persona_id="agent_dev")
    await service.record_run_cost(
        db_session, run, model="claude-sonnet-5", input_tokens=1000, output_tokens=0, is_fake=True
    )
    res = await resources.agent_resources(db_session, project.workspace_id)
    dev = next(r for r in res if r["id"] == "agent_dev")
    assert dev["active_load"] == 1  # queued counts as active
    assert dev["cost_tokens"] == 1000


async def test_capacity_guard(db_session, make_project):
    project = await make_project()
    story = await _story(db_session, project)
    for _ in range(resources.PERSONA_CAPACITY):
        await service.create_run(db_session, story_id=story.id, persona_id="agent_dev")

    with pytest.raises(resources.PersonaAtCapacity):
        await resources.assert_persona_capacity(db_session, project.workspace_id, "agent_dev")
    # a different persona still has capacity
    await resources.assert_persona_capacity(db_session, project.workspace_id, "agent_pm")


async def _project_story(client):
    await client.post(
        "/api/auth/sign-up/",
        json={"display_name": "Ada", "email": "ada@example.test", "password": "s3cret!"},
    )
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    p = (
        await client.post(
            "/api/workspaces/acme/projects/",
            json={"name": "Web", "identifier": "WEB", "flow": "fresh",
                  "cover_image_url": "https://img.test/c.jpg"},
        )
    ).json()
    s = (
        await client.post(
            f"/api/workspaces/acme/projects/{p['id']}/stories/", json={"title": "Task"}
        )
    ).json()
    return p["id"], s["id"]


async def test_agent_resources_endpoint(app, client):
    await _project_story(client)
    res = await client.get("/api/workspaces/acme/agent-resources/")
    assert res.status_code == 200
    assert {r["id"] for r in res.json()} >= {"agent_dev", "agent_pm", "agent_architect"}


async def test_assign_over_capacity_is_409(app, client, db_session):
    pid, sid = await _project_story(client)
    for _ in range(resources.PERSONA_CAPACITY):
        await service.create_run(db_session, story_id=sid, persona_id="agent_dev")
    await db_session.commit()

    res = await client.patch(
        f"/api/workspaces/acme/projects/{pid}/stories/{sid}/", json={"ai_agent_id": "agent_dev"}
    )
    assert res.status_code == 409
    # a persona with capacity assigns fine
    ok = await client.patch(
        f"/api/workspaces/acme/projects/{pid}/stories/{sid}/", json={"ai_agent_id": "agent_pm"}
    )
    assert ok.status_code == 200
