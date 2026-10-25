import pytest

SKILL_MD = "---\nname: verification-gate\ndescription: checks\n---\n"


@pytest.mark.asyncio
async def test_execution_profile_endpoint_returns_pinned_profile(app, client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": "a@example.test", "password": "s3cret!"})
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    p = (await client.post("/api/workspaces/acme/projects/", json={
        "name": "Web", "identifier": "WEB", "flow": "fresh",
        "cover_image_url": "https://img.test/c.jpg"})).json()
    await client.post("/api/workspaces/acme/skills/", json={
        "name": "verification-gate", "version": "1.0.0",
        "files": {"SKILL.md": SKILL_MD}, "manifest": {}})
    s = (await client.post(f"/api/workspaces/acme/projects/{p['id']}/stories/",
                           json={"title": "Fix the checkout cart bug"})).json()

    resp = await client.get(
        f"/api/workspaces/acme/projects/{p['id']}/stories/{s['id']}/execution-profile/")
    assert resp.status_code == 200, resp.text
    profile = resp.json()
    assert profile["classification"]["work_type"] == "bug"
    vg = next(sk for sk in profile["skills"] if sk["skillId"] == "verification-gate")
    assert vg["status"] == "pinned" and vg["mode"] == "required"
    assert vg["digest"].startswith("sha256:")
