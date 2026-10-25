from tests.helpers import by_workflow, sprint_zero

CREATE_PROJECT = {
    "name": "Mobile App", "identifier": "MBA", "flow": "fresh",
    "cover_image_url": "https://img.test/c.jpg",
}


async def setup_project(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    return (
        await client.post("/api/workspaces/acme/projects/", json=CREATE_PROJECT)
    ).json()


async def unlock_prd(client, project_id):
    stories = await sprint_zero(client, project_id)
    track = by_workflow(stories, "track-selection")
    await client.patch(
        f"/api/workspaces/acme/projects/{project_id}/stories/{track['id']}/",
        json={"status": "done"},
    )
    return by_workflow(await sprint_zero(client, project_id), "bmad-prd")


async def test_open_thread_on_unlocked_story(client):
    project = await setup_project(client)
    prd = await unlock_prd(client, project["id"])
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{prd['id']}/thread/"
    )
    assert res.status_code == 201
    thread = res.json()
    assert thread["workflow_id"] == "bmad-prd"
    assert thread["state"] == "conversing"
    assert thread["messages"] == []
    assert set(thread) == {"id", "story_id", "workflow_id", "agent", "state", "messages"}


async def test_open_thread_is_idempotent(client):
    project = await setup_project(client)
    prd = await unlock_prd(client, project["id"])
    url = f"/api/workspaces/acme/projects/{project['id']}/stories/{prd['id']}/thread/"
    first = (await client.post(url)).json()
    second = await client.post(url)
    assert second.status_code == 200
    assert second.json()["id"] == first["id"]


async def test_locked_story_rejects_thread(client):
    project = await setup_project(client)
    prd = by_workflow(await sprint_zero(client, project["id"]), "bmad-prd")
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{prd['id']}/thread/"
    )
    assert res.status_code == 409


async def test_non_llm_step_rejects_thread(client):
    project = await setup_project(client)
    track = by_workflow(await sprint_zero(client, project["id"]), "track-selection")
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{track['id']}/thread/"
    )
    assert res.status_code == 422


async def test_get_thread_404_before_open(client):
    project = await setup_project(client)
    prd = await unlock_prd(client, project["id"])
    res = await client.get(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{prd['id']}/thread/"
    )
    assert res.status_code == 404
