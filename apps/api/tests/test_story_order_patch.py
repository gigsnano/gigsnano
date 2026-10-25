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


async def test_patch_order_persists_fractional_sort_order(client):
    project = await setup_project(client)
    stories = await sprint_zero(client, project["id"])
    story = stories[0]

    res = await client.patch(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}/",
        json={"order": 32767.5},
    )
    assert res.status_code == 200
    assert res.json()["order"] == 32767.5

    refetched = (
        await client.get(f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}/")
    ).json()
    assert refetched["order"] == 32767.5
