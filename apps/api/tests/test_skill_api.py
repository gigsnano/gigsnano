from tests.helpers import make_staff

SKILL_MD = "---\nname: verification-gate\ndescription: checks\n---\n"


async def _signup_ws(client, email="ada@example.test", slug="acme"):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": email, "password": "s3cret!"})
    await client.post("/api/workspaces/", json={"name": slug.title(), "slug": slug})


async def test_publish_list_download_and_lifecycle(app, client):
    await _signup_ws(client)
    pub = await client.post("/api/workspaces/acme/skills/", json={
        "name": "verification-gate", "version": "1.0.0",
        "files": {"SKILL.md": SKILL_MD}, "manifest": {"risk": "low"}})
    assert pub.status_code == 201, pub.text
    vid = pub.json()["id"]
    assert pub.json()["digest"].startswith("sha256:")
    assert pub.json()["lifecycle"] == "draft"

    listing = (await client.get("/api/workspaces/acme/skills/")).json()
    assert [p["name"] for p in listing] == ["verification-gate"]

    dl = await client.get(f"/api/workspaces/acme/skills/versions/{vid}/bundle/")
    assert dl.status_code == 200
    assert dl.headers["x-skill-digest"] == pub.json()["digest"]
    assert dl.content[:2] == b"\x1f\x8b"  # gzip magic

    # draft -> approved directly is illegal
    bad = await client.post(f"/api/workspaces/acme/skills/versions/{vid}/lifecycle/", json={"to": "approved"})
    assert bad.status_code == 409
    for step in ("reviewed", "approved", "revoked"):
        ok = await client.post(f"/api/workspaces/acme/skills/versions/{vid}/lifecycle/", json={"to": step})
        assert ok.status_code == 200, ok.text
    assert (await client.get(f"/api/workspaces/acme/skills/{listing[0]['id']}/")).json()["versions"][0]["lifecycle"] == "revoked"


async def test_instructions_returns_skill_md_and_is_tenant_isolated(app, client):
    """GIN-392: the MCP prompt surface reads SKILL.md as text, under the same
    tenant check as the bundle download."""
    await _signup_ws(client)
    pub = await client.post("/api/workspaces/acme/skills/", json={
        "name": "verification-gate", "version": "1.0.0", "files": {"SKILL.md": SKILL_MD}})
    vid = pub.json()["id"]
    r = await client.get(f"/api/workspaces/acme/skills/versions/{vid}/instructions/")
    assert r.status_code == 200, r.text
    assert r.json()["skill_md"] == SKILL_MD
    assert r.json()["digest"] == pub.json()["digest"]

    await client.post("/api/auth/sign-out/")
    await _signup_ws(client, email="b@example.test", slug="beta")
    assert (await client.get(
        f"/api/workspaces/beta/skills/versions/{vid}/instructions/")).status_code == 404


async def test_publish_rejects_missing_skill_md(app, client):
    await _signup_ws(client)
    r = await client.post("/api/workspaces/acme/skills/", json={
        "name": "x", "version": "1.0.0", "files": {"scripts/run.sh": "x"}})
    assert r.status_code == 422


async def test_private_skill_is_tenant_isolated(app, client):
    await _signup_ws(client, email="a@example.test", slug="acme")
    pub = await client.post("/api/workspaces/acme/skills/", json={
        "name": "verification-gate", "version": "1.0.0", "files": {"SKILL.md": SKILL_MD}})
    vid = pub.json()["id"]
    # second user + workspace
    await client.post("/api/auth/sign-out/")
    await _signup_ws(client, email="b@example.test", slug="beta")
    assert (await client.get("/api/workspaces/beta/skills/")).json() == []
    assert (await client.get(f"/api/workspaces/beta/skills/versions/{vid}/bundle/")).status_code == 404


async def test_publish_public_requires_staff(app, client):
    """I2: a non-staff workspace owner must not be able to publish a public skill
    (public packages are visible to every tenant, so this must be staff-gated)."""
    await _signup_ws(client)  # owner/admin of "acme", not staff
    r = await client.post("/api/workspaces/acme/skills/", json={
        "name": "verification-gate", "version": "1.0.0",
        "visibility": "public", "files": {"SKILL.md": SKILL_MD}})
    assert r.status_code == 403


async def test_publish_public_staff_succeeds(app, client, db_session):
    """Positive counterpart: platform staff CAN publish a public skill."""
    await make_staff(client, db_session)  # signs up + grants staff to ada@example.test
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    r = await client.post("/api/workspaces/acme/skills/", json={
        "name": "verification-gate", "version": "1.0.0",
        "visibility": "public", "files": {"SKILL.md": SKILL_MD}})
    assert r.status_code == 201, r.text


async def test_lifecycle_public_requires_staff(app, client, db_session):
    """I2: a non-staff workspace owner must not be able to revoke/deprecate a PUBLIC
    skill's version via the lifecycle endpoint, even though it's visible to their tenant."""
    await make_staff(client, db_session)
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    pub = await client.post("/api/workspaces/acme/skills/", json={
        "name": "verification-gate", "version": "1.0.0",
        "visibility": "public", "files": {"SKILL.md": SKILL_MD}})
    vid = pub.json()["id"]

    await client.post("/api/auth/sign-out/")
    await _signup_ws(client, email="b@example.test", slug="beta")  # non-staff owner
    r = await client.post(f"/api/workspaces/beta/skills/versions/{vid}/lifecycle/", json={"to": "reviewed"})
    assert r.status_code == 403
