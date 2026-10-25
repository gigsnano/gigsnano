"""MCP wiring for the launcher gate (GIN-342): complete_work_item surfaces an
advisory skill-gate note (never blocks). coordinate_work_item's profile
enrichment is a 3-line merge of two endpoints already covered by their own tests
+ needs a Business subscription, so it isn't re-tested at the MCP layer."""

import json

import pytest

from tests.mcp.payload import dumps

from gigsnano_api.features.execution_profiles import service as ep
from gigsnano_api.features.skills.launcher import prepare_launch
from gigsnano_api.features.skills.seed import seed_skills
from gigsnano_api.mcp_server import tools
from gigsnano_api.mcp_server.auth import set_bearer
from gigsnano_api.models import Project, Story


@pytest.mark.asyncio
async def test_complete_work_item_no_profile_still_hands_off(pat_for_user, client):
    """No profile → nothing to gate → the honest handoff still works, no note."""
    p = (await client.get("/api/workspaces/acme/projects/")).json()[0]
    s = (await client.post(f"/api/workspaces/acme/projects/{p['id']}/stories/",
                           json={"title": "Plain story"})).json()
    set_bearer(pat_for_user.token)
    out = await tools.complete_work_item(code=s["code"], pr_url="http://pr/1")
    assert "in_review" in dumps(out)


@pytest.mark.asyncio
async def test_complete_work_item_surfaces_advisory_gate(pat_for_user, client, db_session):
    p = (await client.get("/api/workspaces/acme/projects/")).json()[0]
    s = (await client.post(f"/api/workspaces/acme/projects/{p['id']}/stories/",
                           json={"title": "Refactor the button component design"})).json()

    # Seed the registry + a stored profile, then create a run whose required skills
    # are unverified — the gate-failing state the note must surface.
    project = await db_session.get(Project, p["id"])
    await seed_skills(db_session)
    story = await db_session.get(Story, s["id"])
    await ep.resolve_and_persist(db_session, story, project.workspace_id, story.title, "claude-code")
    await prepare_launch(db_session, story, project.workspace_id)  # creates the run + RESOLVED events
    await db_session.commit()

    set_bearer(pat_for_user.token)
    out = await tools.complete_work_item(code=s["code"], summary="done")
    assert "in_review" in dumps(out)

    comments = (await client.get(
        f"/api/workspaces/acme/projects/{p['id']}/stories/{s['id']}/comments/"
    )).json()
    body = json.dumps(comments)
    assert "Skill gate (advisory)" in dumps(body)
    assert "verification-gate" in dumps(body)
