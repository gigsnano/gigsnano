"""GIN-183 — E2E: assign a persona, run it, hit the review gate, approve.

Ties assignment (Story.ai_agent_id) → create-run → orchestration (draft gates a
mutating tool to awaiting_review) → approval checkpoint → done, plus capacity
enforcement — over the HTTP surface, asserting no state drift between the backend
run and what the timeline reads.
"""

from gigsnano_api.agent.runner import AgentToolCall, AgentToolConfirm
from gigsnano_api.features.agent_runs import service
from gigsnano_api.features.agent_runs.orchestrator import orchestrate
from gigsnano_api.models.agent_runs import AgentRun


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


async def _events(*evs):
    for e in evs:
        yield e


async def test_assign_run_gate_approve_e2e(app, client, db_session):
    pid, sid = await _project_story(client)
    base = f"/api/workspaces/acme/projects/{pid}/stories/{sid}"
    runs = f"{base}/runs"

    # 1. Assign a persona the same way a human is assigned.
    assigned = await client.patch(f"{base}/", json={"ai_agent_id": "agent_dev"})
    assert assigned.status_code == 200
    assert assigned.json()["ai_agent_id"] == "agent_dev"

    # 2. Start a Draft run — uses the assigned persona.
    created = await client.post(runs + "/", json={"autonomy": "draft"})
    assert created.status_code == 201
    run_id = created.json()["id"]
    assert created.json()["persona_id"] == "agent_dev"
    assert created.json()["state"] == "queued"

    # 3. Orchestrate a turn that hits a mutating tool → Draft gates at review.
    run = await db_session.get(AgentRun, run_id)
    await orchestrate(
        db_session, run,
        _events(AgentToolCall("1", "edit_file", {}), AgentToolConfirm("1", "edit_file", {"p": "a"})),
    )
    await db_session.commit()

    # 4. The timeline reads the backend state exactly — no drift.
    read = await client.get(f"{runs}/{run_id}/")
    assert read.json()["state"] == "awaiting_review"
    assert any(s["status"] == "awaiting_approval" for s in read.json()["steps"])

    # 5. Approve the checkpoint → done.
    approved = await client.post(f"{runs}/{run_id}/approve/")
    assert approved.status_code == 200
    assert approved.json()["state"] == "done"


async def test_capacity_enforced_end_to_end(app, client, db_session):
    pid, sid = await _project_story(client)
    runs = f"/api/workspaces/acme/projects/{pid}/stories/{sid}/runs"

    # Three active runs saturate agent_dev's capacity.
    for _ in range(3):
        await service.create_run(db_session, story_id=sid, persona_id="agent_dev")
    await db_session.commit()

    over = await client.post(runs + "/", json={"persona_id": "agent_dev", "autonomy": "draft"})
    assert over.status_code == 409

    # The workload board reflects the live load.
    board = (await client.get("/api/workspaces/acme/agent-resources/")).json()
    dev = next(r for r in board if r["id"] == "agent_dev")
    assert dev["active_load"] == 3
    assert dev["active_load"] >= dev["capacity"]
