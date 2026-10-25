"""GIN-392: registry skills are published as MCP prompts.

Before this, the prompt list was always empty, so a connecting client had no
"Skills" group at all — the registry was reachable only as two more API actions.
"""

import pytest

from gigsnano_api.mcp_server.auth import set_bearer
from gigsnano_api.mcp_server.prompts import get_prompt, list_prompts

SKILL_MD = "---\nname: verification-gate\ndescription: checks\n---\n\n# Gate\nRun the checks.\n"


async def _publish(client, version="1.0.0"):
    r = await client.post(
        "/api/workspaces/acme/skills/",
        json={
            "name": "verification-gate",
            "version": version,
            "files": {"SKILL.md": SKILL_MD},
            "manifest": {"risk": "low", "description": "Run the right checks"},
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


@pytest.mark.asyncio
async def test_visible_skills_are_listed_as_prompts(pat_for_user, client):
    await _publish(client)
    set_bearer(pat_for_user.token)
    prompts = await list_prompts()
    gate = next(p for p in prompts if p.name == "verification-gate")
    assert gate.description == "Run the right checks"
    assert {a.name for a in gate.arguments} == {"work_item", "project"}


@pytest.mark.asyncio
async def test_get_prompt_returns_the_skill_instructions(pat_for_user, client):
    await _publish(client)
    set_bearer(pat_for_user.token)
    result = await get_prompt("verification-gate", {"work_item": "GIN-392"})
    body = result.messages[0].content.text
    assert "Run the checks." in body       # the SKILL.md itself, not just metadata
    assert "GIN-392" in body               # focused on the caller's work item


@pytest.mark.asyncio
async def test_unknown_skill_is_rejected(pat_for_user, client):
    await _publish(client)
    set_bearer(pat_for_user.token)
    with pytest.raises(ValueError):
        await get_prompt("nope", None)
