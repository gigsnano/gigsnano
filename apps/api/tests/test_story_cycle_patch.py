"""PATCH /stories/{id}/ must move a work item into a cycle (and a module).

Regression: `cycle_id`/`module_id` were missing from `UpdateStoryPayload`, so
pydantic dropped them and the PATCH silently returned the story unchanged.
"""

from tests.helpers import sprint_zero


async def setup_project(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    return (
        await client.post("/api/workspaces/acme/projects/", json={
            "name": "Mobile App", "identifier": "MBA", "flow": "fresh",
            "cover_image_url": "https://img.test/c.jpg",
        })
    ).json()


async def test_patch_assigns_story_to_cycle(client):
    project = await setup_project(client)
    story = (await sprint_zero(client, project["id"]))[0]
    cycle = (
        await client.post(
            f"/api/workspaces/acme/projects/{project['id']}/cycles/",
            json={"name": "Cycle 2", "start_date": "2026-07-20"},
        )
    ).json()

    res = await client.patch(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}/",
        json={"cycle_id": cycle["id"]},
    )
    assert res.status_code == 200
    assert res.json()["cycle_id"] == cycle["id"]

    refetched = (
        await client.get(f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}/")
    ).json()
    assert refetched["cycle_id"] == cycle["id"]

    # and it can be cleared again
    cleared = await client.patch(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}/",
        json={"cycle_id": None},
    )
    assert cleared.json()["cycle_id"] is None


async def test_patch_rejects_cycle_from_another_project(client):
    project = await setup_project(client)
    story = (await sprint_zero(client, project["id"]))[0]
    other = (
        await client.post("/api/workspaces/acme/projects/", json={
            "name": "Web App", "identifier": "WEB", "flow": "fresh",
            "cover_image_url": "https://img.test/c.jpg",
        })
    ).json()
    foreign = (
        await client.post(
            f"/api/workspaces/acme/projects/{other['id']}/cycles/",
            json={"name": "Cycle 2"},
        )
    ).json()

    res = await client.patch(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}/",
        json={"cycle_id": foreign["id"]},
    )
    assert res.status_code == 404
