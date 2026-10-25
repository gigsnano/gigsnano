async def setup_project(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!"})
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    return (await client.post("/api/workspaces/acme/projects/", json={
        "name": "App", "identifier": "APP", "flow": "fresh",
        "cover_image_url": "https://img.test/c.jpg"})).json()


async def test_analytics_shape_and_counters(client):
    await setup_project(client)  # seeds Sprint-0 (10 bmad stories) + a Sprint-0 cycle
    res = await client.get("/api/workspaces/acme/analytics/")
    assert res.status_code == 200
    a = res.json()
    assert set(a) == {
        "workspace_slug", "active_projects", "total_projects", "active_cycles",
        "completed_stories", "total_stories", "sprint_zero_complete", "members_active",
        "project_progress", "velocity", "active_cycle_details"}
    assert a["total_projects"] == 1
    assert a["active_projects"] == 1 and a["sprint_zero_complete"] == 0  # fresh project
    assert a["total_stories"] == 10 and a["completed_stories"] == 0
    assert a["members_active"] == 1
    pp = a["project_progress"]
    assert len(pp) == 1 and pp[0]["identifier"] == "APP" and pp[0]["progress_pct"] == 0
    # the seeded Sprint-0 cycle is created ACTIVE (observed) → it is the sole active cycle,
    # excluded from velocity (sprint-zero excluded there) but present in active_cycle_details
    assert a["active_cycles"] == 1
    assert a["velocity"] == []
    assert len(a["active_cycle_details"]) == 1
    assert a["active_cycle_details"][0]["story_count"] == 10
    assert isinstance(a["velocity"], list) and isinstance(a["active_cycle_details"], list)


async def test_analytics_empty_workspace(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Alan Turing", "email": "alan@example.test", "password": "s3cret!"})
    await client.post("/api/workspaces/", json={"name": "Beta", "slug": "beta"})
    a = (await client.get("/api/workspaces/beta/analytics/")).json()
    assert a["total_projects"] == 0 and a["total_stories"] == 0
    assert a["project_progress"] == [] and a["velocity"] == [] and a["active_cycle_details"] == []
