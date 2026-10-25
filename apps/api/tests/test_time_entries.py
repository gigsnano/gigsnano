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


async def make_story(client, pid):
    return (
        await client.post(f"/api/workspaces/acme/projects/{pid}/stories/", json={"title": "Task A"})
    ).json()


async def test_time_entries_crud(client):
    p = await setup(client)
    s = await make_story(client, p["id"])
    base = f"/api/workspaces/acme/projects/{p['id']}/stories/{s['id']}/time-entries/"

    assert (await client.get(base)).json() == []

    res = await client.post(base, json={"hours": 2.5, "note": "  wired the grid  "})
    assert res.status_code == 201
    entry = res.json()
    assert entry["hours"] == 2.5
    assert entry["note"] == "wired the grid"  # trimmed
    assert entry["user_name"] == "Ada" and entry["user_id"]

    # second entry — list is newest-first
    await client.post(base, json={"hours": 1})
    listed = (await client.get(base)).json()
    assert len(listed) == 2
    assert listed[0]["id"] == (await client.get(base)).json()[0]["id"]

    # delete the first
    assert (await client.delete(f"{base}{entry['id']}/")).json() == {"success": True}
    remaining = (await client.get(base)).json()
    assert entry["id"] not in [e["id"] for e in remaining]
    assert len(remaining) == 1


async def test_time_entry_hours_must_be_positive(client):
    p = await setup(client)
    s = await make_story(client, p["id"])
    base = f"/api/workspaces/acme/projects/{p['id']}/stories/{s['id']}/time-entries/"
    assert (await client.post(base, json={"hours": 0})).status_code == 422
    assert (await client.post(base, json={"hours": -3})).status_code == 422


async def test_time_entry_delete_guarded_to_owner(client):
    p = await setup(client)
    s = await make_story(client, p["id"])
    base = f"/api/workspaces/acme/projects/{p['id']}/stories/{s['id']}/time-entries/"
    eid = (await client.post(base, json={"hours": 1})).json()["id"]

    # a second account can't delete Ada's entry (404 — not a project member here)
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Bob", "email": "bob@example.test", "password": "s3cret!",
    })
    assert (await client.delete(f"{base}{eid}/")).status_code in (403, 404)
