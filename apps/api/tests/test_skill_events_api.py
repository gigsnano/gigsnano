import pytest

from gigsnano_api.models.agent_runs import AgentRun


async def _setup(client, db_session, slug="acme"):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": f"{slug}@example.test", "password": "s3cret!"})
    await client.post("/api/workspaces/", json={"name": slug.title(), "slug": slug})
    p = (await client.post(f"/api/workspaces/{slug}/projects/", json={
        "name": "Web", "identifier": "WEB", "flow": "fresh",
        "cover_image_url": "https://img.test/c.jpg"})).json()
    s = (await client.post(f"/api/workspaces/{slug}/projects/{p['id']}/stories/",
                           json={"title": "T"})).json()
    run = AgentRun(story_id=s["id"], persona_id="agent_dev")
    db_session.add(run)
    await db_session.commit()
    return slug, p["id"], s["id"], run.id


def _base(slug, pid, sid, rid):
    return f"/api/workspaces/{slug}/projects/{pid}/stories/{sid}/runs/{rid}/skill-events/"


@pytest.mark.asyncio
async def test_ingest_list_and_idempotent(app, client, db_session):
    slug, pid, sid, rid = await _setup(client, db_session)
    base = _base(slug, pid, sid, rid)
    r1 = await client.post(base, json={"skill_id": "vg", "state": "materialized", "dedupe_key": "k1"})
    assert r1.status_code == 201, r1.text
    r2 = await client.post(base, json={"skill_id": "vg", "state": "materialized", "dedupe_key": "k1"})
    assert r2.status_code in (200, 201) and r2.json()["id"] == r1.json()["id"]  # idempotent
    listing = (await client.get(base)).json()
    assert len(listing["events"]) == 1
    assert listing["current_states"]["vg"] == "materialized"


@pytest.mark.asyncio
async def test_gate_endpoint_requires_evidence(app, client, db_session):
    slug, pid, sid, rid = await _setup(client, db_session)
    base = _base(slug, pid, sid, rid)
    fail = await client.post(base + "gate/", json={"required_skills": ["vg"], "gates": []})
    assert fail.json()["passed"] is False
    await client.post(base, json={"skill_id": "vg", "state": "gate_verified",
                                  "dedupe_key": "g1", "evidence": [{"type": "pr", "ref": "#1"}]})
    ok = await client.post(base + "gate/", json={"required_skills": ["vg"], "gates": []})
    assert ok.json()["passed"] is True


@pytest.mark.asyncio
async def test_run_is_tenant_scoped(app, client, db_session):
    slug, pid, sid, rid = await _setup(client, db_session, slug="acme")
    # second workspace/user cannot reach acme's run
    await client.post("/api/auth/sign-out/")
    await _setup(client, db_session, slug="beta")
    leak = await client.get(_base("beta", pid, sid, rid))  # acme's ids under beta
    assert leak.status_code == 404


@pytest.mark.asyncio
async def test_foreign_run_under_own_story_is_404(app, client, db_session):
    # Exercises _load_run's run.story_id guard specifically: a valid own
    # story/project path but a run_id belonging to a DIFFERENT story in the SAME
    # workspace must 404 (require_story_route_access alone would let this through).
    slug, pid, sid, rid = await _setup(client, db_session, slug="acme")
    other = (await client.post(f"/api/workspaces/{slug}/projects/{pid}/stories/",
                               json={"title": "Other"})).json()
    other_run = AgentRun(story_id=other["id"], persona_id="agent_dev")
    db_session.add(other_run)
    await db_session.commit()
    # own story sid, but other_run belongs to `other` story -> 404 via _load_run
    resp = await client.get(_base(slug, pid, sid, other_run.id))
    assert resp.status_code == 404
