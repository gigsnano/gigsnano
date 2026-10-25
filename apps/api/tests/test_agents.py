async def test_agents_list(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!"})
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    # Task 2 repointed GET .../agents/ at the real per-workspace roster
    # (see test_agents_router.py); this static BMAD-template metadata moved
    # to .../agents/bmad/, same response shape as before.
    res = await client.get("/api/workspaces/acme/agents/bmad/")
    assert res.status_code == 200
    agents = res.json()
    assert len(agents) == 7
    a = agents[0]
    assert set(a) == {"id", "name", "persona", "skill_id", "description", "workflows", "phase"}
    assert a["id"] == "agent_analyst" and a["persona"] == "Mary"
    assert isinstance(a["workflows"], list)


async def test_agents_requires_auth(client):
    res = await client.get("/api/workspaces/acme/agents/")
    assert res.status_code in (401, 403, 404)
