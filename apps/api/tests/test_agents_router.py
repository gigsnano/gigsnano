async def setup_ws(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!"})
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})


async def test_lists_seeded_builtins_and_creates_a_custom_agent(client):
    await setup_ws(client)
    base = "/api/workspaces/acme/agents/"

    seeded = (await client.get(base)).json()
    assert [a["name"] for a in seeded if a["is_builtin"]] != []

    res = await client.post(base, json={
        "name": "Finance", "persona": "Ravi", "domain": "finance",
        "instructions": "Watch the budget.", "bundles": ["spend_time"]})
    assert res.status_code == 201
    agent = res.json()
    assert agent["is_builtin"] is False
    assert agent["bundles"] == ["spend_time"]

    patched = (await client.patch(f"{base}{agent['id']}/",
                                  json={"instructions": "Watch burn rate."})).json()
    assert patched["instructions"] == "Watch burn rate."

    assert (await client.delete(f"{base}{agent['id']}/")).status_code == 204


async def test_builtin_cannot_be_deleted(client):
    await setup_ws(client)
    base = "/api/workspaces/acme/agents/"
    builtin = next(a for a in (await client.get(base)).json() if a["is_builtin"])
    assert (await client.delete(f"{base}{builtin['id']}/")).status_code == 409


async def test_duplicate_name_is_refused(client):
    await setup_ws(client)
    base = "/api/workspaces/acme/agents/"
    body = {"name": "Finance", "bundles": []}
    assert (await client.post(base, json=body)).status_code == 201
    assert (await client.post(base, json=body)).status_code == 409


async def test_concurrent_duplicate_name_is_409_not_500(client, monkeypatch):
    """`name_taken` is a pre-check, not the guarantee: two requests can both pass
    it before either commits. Simulate that race by forcing the pre-check to
    always say "free" so both creates fall through to the DB commit, which is
    where `uq_agent_ws_name` actually catches it. The second commit must surface
    as 409, not an unhandled IntegrityError -> 500."""
    from gigsnano_api.features.agents import router as agents_router

    async def always_free(*_args, **_kwargs):
        return False

    monkeypatch.setattr(agents_router.S, "name_taken", always_free)
    await setup_ws(client)
    base = "/api/workspaces/acme/agents/"
    body = {"name": "Finance", "bundles": []}
    assert (await client.post(base, json=body)).status_code == 201
    res = await client.post(base, json=body)
    assert res.status_code == 409


async def test_unknown_bundle_is_refused(client):
    await setup_ws(client)
    res = await client.post("/api/workspaces/acme/agents/",
                            json={"name": "Rogue", "bundles": ["delete_everything"]})
    assert res.status_code == 422


async def test_agents_are_workspace_scoped(client):
    await setup_ws(client)
    agent_id = (await client.post("/api/workspaces/acme/agents/",
                                  json={"name": "Finance", "bundles": []})).json()["id"]
    await client.post("/api/workspaces/", json={"name": "Beta", "slug": "beta"})
    assert (await client.get(f"/api/workspaces/beta/agents/{agent_id}/")).status_code == 404


async def test_seed_builtin_agents_is_idempotent(client, db_session):
    """A retry (or a future second call site) must not IntegrityError on
    `uq_agent_ws_name` -- a second seed for the same workspace should be a
    no-op, not a crash. Deterministic ids mirror migration 7d1634bd7228's
    scheme so a genuine retry within the same seed also recomputes the exact
    same row rather than a name clash under a different id."""
    from sqlalchemy import select

    from gigsnano_api.features.agents.service import seed_builtin_agents
    from gigsnano_api.models import Agent, Workspace

    await setup_ws(client)
    ws = (
        await db_session.execute(select(Workspace).where(Workspace.slug == "acme"))
    ).scalar_one()

    before = (
        await db_session.execute(select(Agent.id).where(Agent.workspace_id == ws.id))
    ).all()

    await seed_builtin_agents(db_session, ws.id)
    await db_session.commit()

    after = (
        await db_session.execute(select(Agent.id).where(Agent.workspace_id == ws.id))
    ).all()
    assert len(after) == len(before)


async def test_foreign_project_id_is_refused(client):
    await setup_ws(client)
    project = (await client.post(
        "/api/workspaces/acme/projects/",
        json={"name": "Web", "identifier": "WEB", "flow": "fresh",
              "cover_image_url": "https://img.test/c.jpg"},
    )).json()

    await client.post("/api/workspaces/", json={"name": "Beta", "slug": "beta"})
    res = await client.post("/api/workspaces/beta/agents/", json={
        "name": "Finance", "bundles": [], "project_id": project["id"]})
    assert res.status_code == 404

    # Same project, own workspace: accepted.
    res = await client.post("/api/workspaces/acme/agents/", json={
        "name": "Finance", "bundles": [], "project_id": project["id"]})
    assert res.status_code == 201
    assert res.json()["project_id"] == project["id"]
