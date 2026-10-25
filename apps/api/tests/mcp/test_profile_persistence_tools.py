import json

import pytest

from gigsnano_api.mcp_server import tools
from gigsnano_api.mcp_server.auth import set_bearer

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
async def test_get_creates_and_override_reflects(pat_for_user, client):
    p, s = await _seed(client)
    set_bearer(pat_for_user.token)
    prof = await tools.get_execution_profile(code=s["code"])  # creates
    assert "stale" in prof
    await tools.override_execution_profile(
        code=s["code"], changes=[{"skillId": "verification-gate", "mode": "prohibited"}], reason="x")
    prof2 = await tools.get_execution_profile(code=s["code"])
    vg = next(sk for sk in prof2["profile"]["skills"] if sk["skillId"] == "verification-gate")
    assert vg["mode"] == "prohibited"
