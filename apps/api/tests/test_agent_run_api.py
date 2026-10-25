from gigsnano_api.features.agent_runs import service
from gigsnano_api.models.agent_runs import EAgentRunStepKind
from gigsnano_api.models.stories import Story


async def _seed_story(db, make_project):
    project = await make_project()
    story = Story(project_id=project.id, title="Task", story_number=1)
    db.add(story)
    await db.flush()
    return story


async def test_record_run_cost_fake_then_priced(db_session, make_project):
    story = await _seed_story(db_session, make_project)
    run = await service.create_run(db_session, story_id=story.id, persona_id="agent_dev")

    await service.record_run_cost(
        db_session, run, model="claude-sonnet-5", input_tokens=1000, output_tokens=500, is_fake=True
    )
    assert run.cost_tokens == 1500
    assert float(run.cost_usd) == 0  # fake turn costs nothing

    await service.record_run_cost(
        db_session, run, model="claude-sonnet-5", input_tokens=1000, output_tokens=500
    )
    assert run.cost_tokens == 3000
    assert float(run.cost_usd) > 0  # priced model accrues USD


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


async def test_run_replay_endpoints(app, client, db_session):
    pid, sid = await _project_story(client)
    run = await service.create_run(db_session, story_id=sid, persona_id="agent_dev")
    await service.add_step(db_session, run, kind=EAgentRunStepKind.PLAN, summary="plan")
    await service.add_step(db_session, run, kind=EAgentRunStepKind.ARTIFACT, summary="result", tokens=42)
    await db_session.commit()

    base = f"/api/workspaces/acme/projects/{pid}/stories/{sid}/runs"

    lst = await client.get(base + "/")
    assert lst.status_code == 200
    assert len(lst.json()) == 1

    got = await client.get(f"{base}/{run.id}/")
    assert got.status_code == 200
    body = got.json()
    assert body["persona_id"] == "agent_dev"
    assert [s["kind"] for s in body["steps"]] == ["plan", "artifact"]
    assert body["cost_tokens"] == 42

    stream = await client.get(f"{base}/{run.id}/stream/")
    assert stream.status_code == 200
    assert "plan" in stream.text
    assert "event: state" in stream.text


async def test_run_404_for_other_story(app, client, db_session):
    pid, sid = await _project_story(client)
    base = f"/api/workspaces/acme/projects/{pid}/stories/{sid}/runs"
    res = await client.get(f"{base}/does-not-exist/")
    assert res.status_code == 404


async def test_create_run_and_retry(app, client):
    pid, sid = await _project_story(client)
    base = f"/api/workspaces/acme/projects/{pid}/stories/{sid}/runs"

    # no persona anywhere -> 400
    r0 = await client.post(base + "/", json={"autonomy": "draft"})
    assert r0.status_code == 400

    r = await client.post(base + "/", json={"persona_id": "agent_dev", "autonomy": "autopilot"})
    assert r.status_code == 201
    run = r.json()
    assert run["persona_id"] == "agent_dev"
    assert run["autonomy"] == "autopilot"
    assert run["state"] == "queued"

    # a queued run can't be retried (only failed/stopped) -> 409
    retry = await client.post(f"{base}/{run['id']}/retry/")
    assert retry.status_code == 409


async def test_approve_and_reject_checkpoint(app, client, db_session):
    from gigsnano_api.features.agent_runs import service
    from gigsnano_api.models.agent_runs import EAgentRunState as S

    pid, sid = await _project_story(client)
    base = f"/api/workspaces/acme/projects/{pid}/stories/{sid}/runs"

    async def _awaiting():
        run = await service.create_run(db_session, story_id=sid, persona_id="agent_dev")
        await service.advance_run(db_session, run, S.PLANNING)
        await service.advance_run(db_session, run, S.EXECUTING)
        await service.advance_run(db_session, run, S.AWAITING_REVIEW)
        await db_session.commit()
        return run

    run = await _awaiting()
    ok = await client.post(f"{base}/{run.id}/approve/")
    assert ok.status_code == 200
    assert ok.json()["state"] == "done"
    # already done -> 409
    assert (await client.post(f"{base}/{run.id}/approve/")).status_code == 409

    run2 = await _awaiting()
    rej = await client.post(f"{base}/{run2.id}/reject/")
    assert rej.status_code == 200
    assert rej.json()["state"] == "executing"
