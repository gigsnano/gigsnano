async def _project(client):
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


async def test_new_project_seeds_features_and_states(client):
    project = await _project(client)
    pid = project["id"]

    features = (await client.get(f"/api/workspaces/acme/projects/{pid}/features/")).json()
    by_key = {f["key"]: f for f in features}
    assert set(by_key) == {"cycles", "modules", "views", "pages"}
    assert by_key["cycles"]["enabled"] is True
    assert by_key["pages"]["enabled"] is False

    states = (await client.get(f"/api/workspaces/acme/projects/{pid}/states/")).json()
    assert [s["name"] for s in states] == ["Backlog", "Todo", "In progress", "In review", "Done"]
    assert [s["order"] for s in states] == [0, 1, 2, 3, 4]
    assert states[0]["group"] == "backlog"

    # No default labels/estimates/automations.
    for coll in ("labels", "estimates", "automations"):
        assert (await client.get(f"/api/workspaces/acme/projects/{pid}/{coll}/")).json() == []
