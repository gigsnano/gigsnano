import pytest

from gigsnano_api.mcp_server import tools
from gigsnano_api.mcp_server.api import ApiError
from gigsnano_api.mcp_server.auth import set_bearer

from tests.mcp.payload import dumps

SKILL_MD = "---\nname: verification-gate\ndescription: checks\n---\n"


async def _publish(client):
    r = await client.post(
        "/api/workspaces/acme/skills/",
        json={
            "name": "verification-gate",
            "version": "1.0.0",
            "files": {"SKILL.md": SKILL_MD},
            "manifest": {"risk": "low", "description": "Run the right checks"},
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _publish_version(client, version, revoke=False):
    r = await client.post(
        "/api/workspaces/acme/skills/",
        json={
            "name": "verification-gate",
            "version": version,
            "files": {"SKILL.md": SKILL_MD + version},  # distinct content per version
            "manifest": {"risk": "low"},
        },
    )
    assert r.status_code == 201, r.text
    v = r.json()
    if revoke:
        for step in ("reviewed", "approved", "revoked"):
            lr = await client.post(
                f"/api/workspaces/acme/skills/versions/{v['id']}/lifecycle/", json={"to": step}
            )
            assert lr.status_code == 200, lr.text
    return v


@pytest.mark.asyncio
async def test_list_skills_shows_published(pat_for_user, client):
    pub = await _publish(client)
    set_bearer(pat_for_user.token)
    out = await tools.list_skills()
    assert "verification-gate" in dumps(out)
    assert pub["digest"] in dumps(out)


@pytest.mark.asyncio
async def test_search_skills_hit_and_miss(pat_for_user, client):
    await _publish(client)
    set_bearer(pat_for_user.token)
    assert "verification-gate" in dumps(await tools.search_skills(query="verif"))
    # matches a version's manifest description
    assert "verification-gate" in dumps(await tools.search_skills(query="right checks"))
    assert "verification-gate" not in dumps(await tools.search_skills(query="zzzznope"))
@pytest.mark.asyncio
async def test_get_skill_manifest_returns_metadata_not_bytes(pat_for_user, client):
    pub = await _publish(client)
    set_bearer(pat_for_user.token)
    out = await tools.get_skill_manifest(skill="verification-gate")
    assert pub["digest"] in dumps(out)
    assert "draft" in dumps(out)
    assert "/skills/versions/" in dumps(out) and "/bundle/" in dumps(out)
    assert "Run the right checks" in dumps(out)  # manifest metadata present
    assert SKILL_MD not in dumps(out)            # raw bundle content absent


@pytest.mark.asyncio
async def test_get_skill_manifest_latest_is_highest_semver_excluding_revoked(pat_for_user, client):
    import json

    await _publish_version(client, "1.0.0")
    v2 = await _publish_version(client, "2.0.0")
    await _publish_version(client, "3.0.0", revoke=True)  # revoked -> excluded
    set_bearer(pat_for_user.token)
    data = await tools.get_skill_manifest(skill="verification-gate")
    assert data["version"] == "2.0.0"  # highest non-revoked, deterministic
    assert data["digest"] == v2["digest"]


@pytest.mark.asyncio
async def test_get_skill_manifest_unknown_skill_and_version(pat_for_user, client):
    await _publish(client)
    set_bearer(pat_for_user.token)
    with pytest.raises(ApiError):
        await tools.get_skill_manifest(skill="nope")
    with pytest.raises(ApiError):
        await tools.get_skill_manifest(skill="verification-gate", version="9.9.9")
