CREATE_PROJECT = {
    "name": "Mobile App", "identifier": "MBA", "flow": "fresh", "has_ui": False,
    "cover_image_url": "https://img.test/c.jpg",
}


async def setup(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    return (await client.post("/api/workspaces/acme/projects/", json=CREATE_PROJECT)).json()


async def make_story(client, pid, title="Task A"):
    return (
        await client.post(f"/api/workspaces/acme/projects/{pid}/stories/", json={"title": title})
    ).json()


async def log(client, pid, sid, hours, note=""):
    return await client.post(
        f"/api/workspaces/acme/projects/{pid}/stories/{sid}/time-entries/",
        json={"hours": hours, "note": note},
    )


async def test_workspace_report_enriches_and_filters(client):
    p = await setup(client)
    pid = p["id"]
    s1 = await make_story(client, pid, "Story one")
    s2 = await make_story(client, pid, "Story two")
    await log(client, pid, s1["id"], 2, "a")
    await log(client, pid, s1["id"], 1, "b")
    await log(client, pid, s2["id"], 3, "c")

    rows = (await client.get("/api/workspaces/acme/time-entries/")).json()
    assert len(rows) == 3
    r = rows[0]
    # enriched with story + project context
    assert set(r) >= {
        "id", "hours", "note", "created_at", "user_id", "user_name",
        "story_id", "story_title", "story_code", "project_id", "project_name",
    }
    assert r["project_name"] == "Mobile App"
    assert r["story_code"].startswith("MBA-")
    assert r["user_name"] == "Ada"

    # by-work-item filter (GIN-59)
    only_s1 = (await client.get(f"/api/workspaces/acme/time-entries/?story_id={s1['id']}")).json()
    assert len(only_s1) == 2
    assert {x["story_id"] for x in only_s1} == {s1["id"]}
    assert sum(x["hours"] for x in only_s1) == 3

    # by-person filter (GIN-58)
    me = rows[0]["user_id"]
    mine = (await client.get(f"/api/workspaces/acme/time-entries/?user_id={me}")).json()
    assert len(mine) == 3


async def test_workspace_report_scoped_to_workspace(client):
    await setup(client)
    await client.post("/api/workspaces/", json={"name": "Beta", "slug": "beta"})
    assert (await client.get("/api/workspaces/beta/time-entries/")).json() == []
