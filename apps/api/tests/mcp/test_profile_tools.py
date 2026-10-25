import pytest

from gigsnano_api.mcp_server import tools
from gigsnano_api.mcp_server.api import ApiError
from gigsnano_api.mcp_server.auth import set_bearer
from gigsnano_api.models.agent_runs import AgentRun

from tests.mcp.payload import dumps

SKILL_MD = "---\nname: verification-gate\ndescription: checks\n---\n"


async def _seed(client):
    p = (await client.get("/api/workspaces/acme/projects/")).json()[0]
    await client.post("/api/workspaces/acme/skills/", json={
        "name": "verification-gate", "version": "1.0.0",
        "files": {"SKILL.md": SKILL_MD}, "manifest": {}})
    s = (await client.post(f"/api/workspaces/acme/projects/{p['id']}/stories/",
                           json={"title": "Fix the checkout cart bug"})).json()
    return p, s


@pytest.mark.asyncio
async def test_resolve_execution_profile_tool(pat_for_user, client):
    p, s = await _seed(client)
    set_bearer(pat_for_user.token)
    out = await tools.resolve_execution_profile(code=s["code"])
    assert "bug" in dumps(out)
    assert "verification-gate" in dumps(out)
    assert "sha256:" in dumps(out)  # the pinned digest


@pytest.mark.asyncio
async def test_report_skill_event_tool_is_idempotent(pat_for_user, client, db_session):
    p, s = await _seed(client)
    run = AgentRun(story_id=s["id"], persona_id="agent_dev")
    db_session.add(run)
    await db_session.commit()
    set_bearer(pat_for_user.token)
    await tools.report_skill_event(code=s["code"], run_id=run.id, skill_id="vg",
                                   state="materialized", dedupe_key="k1")
    await tools.report_skill_event(code=s["code"], run_id=run.id, skill_id="vg",
                                   state="materialized", dedupe_key="k1")
    listing = (await client.get(
        f"/api/workspaces/acme/projects/{p['id']}/stories/{s['id']}/runs/{run.id}/skill-events/"
    )).json()
    assert len(listing["events"]) == 1  # idempotent
    assert listing["current_states"]["vg"] == "materialized"


@pytest.mark.asyncio
async def test_report_skill_event_unknown_run_errors(pat_for_user, client):
    p, s = await _seed(client)
    set_bearer(pat_for_user.token)
    with pytest.raises(ApiError):
        await tools.report_skill_event(code=s["code"], run_id="nope", skill_id="vg",
                                       state="materialized", dedupe_key="k1")
