"""GIN-217 — Smart Intake E2E: submit via a public form + personal capture, run
the Analyst engine (classify/dedupe/enrich/route), then one-click accept into a
routed Story with a live AgentRun. Hermetic: FakeProvider (keyless extract
synthesizes a schema-valid draft), and the live-run bg task is stubbed so the
test asserts the synchronous outcome, not the async loop.
"""

from sqlalchemy import select

from gigsnano_api.bmad.provider import FakeProvider
from gigsnano_api.features.intake.engine import combine_priority
from gigsnano_api.models import Story
from gigsnano_api.models.agent_runs import AgentRun


async def _setup(client):
    await client.post("/api/auth/sign-up/",
                      json={"display_name": "Ada", "email": "ada@example.test", "password": "s3cret!"})
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    p = (await client.post("/api/workspaces/acme/projects/",
                           json={"name": "Web", "identifier": "WEB", "flow": "fresh",
                                 "cover_image_url": "https://img.test/c.jpg"})).json()
    return p["id"]


async def test_intake_end_to_end(app, client, db_session, monkeypatch):
    app.state.llm_provider = FakeProvider()
    # Stub the live-run dispatch: the run is created synchronously by coordinate();
    # executing it hits the module-level (prod) async_session, out of scope here.
    async def _noop(*a, **k):
        return None
    monkeypatch.setattr("gigsnano_api.features.intake.router.run_agent_run_in_fresh_session", _noop)

    project_id = await _setup(client)

    # --- Public form channel (unauthenticated, token-scoped) ---
    link = (await client.post("/api/workspaces/acme/intake-link/")).json()
    assert "token" in link
    submitted = await client.post(f"/api/public/intake/{link['token']}/",
                                  json={"title": "Login is broken", "body": "500 on submit",
                                        "email": "user@x.test"})
    assert submitted.status_code == 201

    bad = await client.post("/api/public/intake/not-a-token/", json={"title": "x"})
    assert bad.status_code == 404  # invalid token never leaks a workspace

    # --- Personal capture (authenticated, private) ---
    cap = await client.post("/api/workspaces/acme/triage/",
                            json={"title": "Add SSO", "body": "Enterprise wants SAML",
                                  "source": "personal", "project_id": project_id})
    assert cap.status_code == 201
    item_id = cap.json()["id"]

    # Both land in triage, isolated from the board.
    queue = (await client.get("/api/workspaces/acme/triage/")).json()
    assert {i["source"] for i in queue} == {"public_form", "personal"}

    # --- Analyst engine ---
    processed = (await client.post(f"/api/workspaces/acme/triage/{item_id}/process/")).json()
    assert processed["status"] == "triaged"
    assert processed["classification"].get("task_type")
    assert processed["recommended_route"].get("persona_id")
    assert processed["enriched_title"]          # FakeProvider synthesized a draft
    assert processed["priority"]

    # --- One-click accept → routed Story + live run ---
    accepted = await client.post(f"/api/workspaces/acme/triage/{item_id}/accept/",
                                 json={"project_id": project_id, "route": "persona"})
    assert accepted.status_code == 200
    story_id = accepted.json()["created_story_id"]
    assert accepted.json()["status"] == "accepted"
    assert story_id

    story = await db_session.get(Story, story_id)
    assert story is not None and story.ai_agent_id  # assigned to the recommended persona
    run = (await db_session.execute(
        select(AgentRun).where(AgentRun.story_id == story_id)
    )).scalars().first()
    assert run is not None  # coordinate() staffed the work in one step


def test_combine_priority():
    # Customer weight is a floor; impact wins when higher.
    assert combine_priority("low", 0) == "low"
    assert combine_priority("low", 3) == "urgent"      # strategic customer lifts it
    assert combine_priority("urgent", 1) == "urgent"   # impact already above the floor
    assert combine_priority("none", 2) == "high"
