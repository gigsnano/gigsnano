import pytest

SKILL_MD = "---\nname: verification-gate\ndescription: checks\n---\n"


async def _setup(client, slug="acme"):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": f"{slug}@example.test", "password": "s3cret!"})
    await client.post("/api/workspaces/", json={"name": slug.title(), "slug": slug})
    p = (await client.post(f"/api/workspaces/{slug}/projects/", json={
        "name": "Web", "identifier": "WEB", "flow": "fresh",
        "cover_image_url": "https://img.test/c.jpg"})).json()
    await client.post(f"/api/workspaces/{slug}/skills/", json={
        "name": "verification-gate", "version": "1.0.0",
        "files": {"SKILL.md": SKILL_MD}, "manifest": {}})
    s = (await client.post(f"/api/workspaces/{slug}/projects/{p['id']}/stories/",
                           json={"title": "Fix the checkout cart bug"})).json()
    return slug, p["id"], s["id"]


def _base(slug, pid, sid):
    return f"/api/workspaces/{slug}/projects/{pid}/stories/{sid}/execution-profile"


@pytest.mark.asyncio
async def test_persist_get_override_lock(app, client):
    slug, pid, sid = await _setup(client)
    base = _base(slug, pid, sid)
    assert (await client.post(base + "/", json={"agent": "claude-code"})).status_code == 200
    stored = (await client.get(base + "/stored/")).json()
    assert stored["stale"] is False
    assert stored["profile"]["classification"]["work_type"] == "bug"

    ov = await client.post(base + "/override/", json={
        "changes": [{"skillId": "verification-gate", "mode": "prohibited"}], "reason": "x"})
    assert ov.status_code == 200
    vg = next(s for s in ov.json()["profile"]["skills"] if s["skillId"] == "verification-gate")
    assert vg["mode"] == "prohibited"

    # lock, then override -> 403
    await client.post(base + "/", json={"agent": "claude-code", "policy": "locked"})
    locked = await client.post(base + "/override/", json={
        "changes": [{"skillId": "verification-gate", "mode": "removed"}], "reason": "x"})
    assert locked.status_code == 403


@pytest.mark.asyncio
async def test_stored_is_tenant_scoped(app, client):
    slug, pid, sid = await _setup(client, slug="acme")
    await client.post(_base(slug, pid, sid) + "/", json={"agent": "auto"})
    await client.post("/api/auth/sign-out/")
    await _setup(client, slug="beta")
    leak = await client.get(_base("beta", pid, sid) + "/stored/")
    assert leak.status_code == 404


@pytest.mark.asyncio
async def test_non_admin_cannot_change_policy(app, client, db_session):
    # A non-admin member must not be able to lock OR unlock the policy (only
    # gating "locked" would let a member POST policy="suggest" to unlock).
    from sqlalchemy import select

    from gigsnano_api.auth.models import User
    from gigsnano_api.models import (
        EMemberStatus, EProjectRole, EWorkspaceRole, ProjectMember, Workspace, WorkspaceMember,
    )

    slug, pid, sid = await _setup(client)  # owner acme
    await client.post(_base(slug, pid, sid) + "/", json={"agent": "auto"})  # owner persists

    # sign-up switches the client's session to a new user; make them a non-admin
    # member of acme WITH project access so require_story_route_access admits them.
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Mem", "email": "mem@example.test", "password": "s3cret!"})
    ws = (await db_session.execute(select(Workspace).where(Workspace.slug == "acme"))).scalar_one()
    mem = (await db_session.execute(select(User).where(User.email == "mem@example.test"))).scalar_one()
    db_session.add_all([
        WorkspaceMember(workspace_id=ws.id, user_id=mem.id,
                        role=EWorkspaceRole.MEMBER, status=EMemberStatus.ACTIVE),
        ProjectMember(project_id=pid, user_id=mem.id,
                      role=EProjectRole.MEMBER, status=EMemberStatus.ACTIVE),
    ])
    await db_session.commit()

    base = _base(slug, pid, sid)
    blocked = await client.post(base + "/", json={"agent": "auto", "policy": "locked"})
    assert blocked.status_code == 403  # cannot change policy
    ok = await client.post(base + "/", json={"agent": "auto"})
    assert ok.status_code == 200  # non-policy persist still allowed
