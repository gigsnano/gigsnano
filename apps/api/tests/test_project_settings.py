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


async def test_labels_crud(client):
    pid = (await setup_project(client))["id"]
    base = f"/api/workspaces/acme/projects/{pid}/labels/"
    assert (await client.get(base)).json() == []

    res = await client.post(base, json={"name": "  Bug  ", "color": "#ef4444"})
    assert res.status_code == 201
    label = res.json()
    assert set(label) == {"id", "project_id", "name", "color", "created_at"}
    assert label["name"] == "Bug" and label["project_id"] == pid

    assert len((await client.get(base)).json()) == 1

    res = await client.delete(f"{base}{label['id']}/")
    assert res.status_code == 200 and res.json() == {"success": True}
    assert (await client.get(base)).json() == []

    assert (await client.delete(f"{base}nope/")).status_code == 404


async def test_estimates_crud_and_type_validation(client):
    pid = (await setup_project(client))["id"]
    base = f"/api/workspaces/acme/projects/{pid}/estimates/"
    res = await client.post(base, json={"name": "Points", "type": "points"})
    assert res.status_code == 201
    est = res.json()
    assert set(est) == {"id", "project_id", "name", "type", "description", "created_at"}
    assert est["description"] == ""

    assert (await client.post(base, json={"name": "Bad", "type": "bananas"})).status_code == 422
    assert (await client.delete(f"{base}{est['id']}/")).status_code == 200


async def test_automations_crud_defaults_enabled(client):
    pid = (await setup_project(client))["id"]
    base = f"/api/workspaces/acme/projects/{pid}/automations/"
    res = await client.post(base, json={"name": "A", "trigger": "PR opened", "action": "Set review"})
    assert res.status_code == 201
    auto = res.json()
    assert set(auto) == {"id", "project_id", "name", "trigger", "action", "enabled", "created_at"}
    assert auto["enabled"] is True


async def test_states_create_orders_and_lists(client):
    pid = (await setup_project(client))["id"]
    base = f"/api/workspaces/acme/projects/{pid}/states/"
    # 5 states are seeded (orders 0-4); a new one gets order 5.
    res = await client.post(base, json={"name": "Blocked", "color": "#f97316", "group": "started"})
    assert res.status_code == 201
    created = res.json()
    assert set(created) == {"id", "project_id", "name", "color", "group", "order"}
    assert created["order"] == 5 and created["group"] == "started"

    states = (await client.get(base)).json()
    assert [s["order"] for s in states] == [0, 1, 2, 3, 4, 5]

    assert (await client.delete(f"{base}{created['id']}/")).status_code == 200
    assert (await client.post(base, json={"name": "X", "color": "#000", "group": "nope"})
            ).status_code == 422


async def test_states_create_order_survives_middle_delete(client):
    # Regression: sort_order was computed from a row COUNT, so deleting a
    # middle state and then creating a new one collided with an existing order.
    pid = (await setup_project(client))["id"]
    base = f"/api/workspaces/acme/projects/{pid}/states/"
    states = (await client.get(base)).json()
    middle = next(s for s in states if s["order"] == 2)

    assert (await client.delete(f"{base}{middle['id']}/")).status_code == 200

    res = await client.post(base, json={"name": "New", "color": "#111", "group": "started"})
    assert res.status_code == 201
    assert res.json()["order"] == 5

    orders = [s["order"] for s in (await client.get(base)).json()]
    assert len(orders) == len(set(orders)), f"duplicate order values: {orders}"


async def test_features_toggle_only(client):
    pid = (await setup_project(client))["id"]
    base = f"/api/workspaces/acme/projects/{pid}/features/"
    features = (await client.get(base)).json()
    pages = next(f for f in features if f["key"] == "pages")
    assert pages["enabled"] is False

    res = await client.patch(f"{base}{pages['id']}/", json={"enabled": True})
    assert res.status_code == 200 and res.json()["enabled"] is True
    assert set(res.json()) == {"id", "project_id", "key", "name", "description", "enabled"}

    assert (await client.patch(f"{base}nope/", json={"enabled": True})).status_code == 404


async def test_features_list_is_in_seeded_order(client):
    pid = (await setup_project(client))["id"]
    base = f"/api/workspaces/acme/projects/{pid}/features/"
    features = (await client.get(base)).json()
    assert [f["key"] for f in features] == ["cycles", "modules", "views", "pages"]


async def test_settings_require_auth_and_scope(client):
    pid = (await setup_project(client))["id"]
    # second workspace/user cannot reach the first project
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Alan Turing", "email": "alan@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Beta", "slug": "beta"})
    res = await client.get(f"/api/workspaces/beta/projects/{pid}/labels/")
    assert res.status_code == 404


async def _make_story(client, pid, **extra):
    return await client.post(
        f"/api/workspaces/acme/projects/{pid}/stories/",
        json={"title": "A task", **extra},
    )


async def test_story_rejects_foreign_label(client):
    pid = (await setup_project(client))["id"]
    # a second project in the same workspace, with its own label
    other = (await client.post("/api/workspaces/acme/projects/", json={
        "name": "Other", "identifier": "OTH", "flow": "fresh",
        "cover_image_url": "https://img.test/c.jpg",
    })).json()
    foreign = (await client.post(
        f"/api/workspaces/acme/projects/{other['id']}/labels/",
        json={"name": "X", "color": "#000"},
    )).json()

    story = (await _make_story(client, pid)).json()
    res = await client.patch(
        f"/api/workspaces/acme/projects/{pid}/stories/{story['id']}/",
        json={"label_id": foreign["id"]},
    )
    assert res.status_code == 400


async def test_story_accepts_same_project_label_and_estimate(client):
    pid = (await setup_project(client))["id"]
    label = (await client.post(
        f"/api/workspaces/acme/projects/{pid}/labels/", json={"name": "Bug", "color": "#ef4444"},
    )).json()
    est = (await client.post(
        f"/api/workspaces/acme/projects/{pid}/estimates/", json={"name": "Pts", "type": "points"},
    )).json()
    story = (await _make_story(client, pid)).json()

    res = await client.patch(
        f"/api/workspaces/acme/projects/{pid}/stories/{story['id']}/",
        json={"label_id": label["id"], "estimate_id": est["id"], "estimate_points": 3},
    )
    assert res.status_code == 200
    # The legacy singular still writes (LegacyLabelMixin folds it into label_ids)
    # and still reads back, derived from the set (GIN-475).
    assert res.json()["label_ids"] == [label["id"]]
    assert res.json()["label_id"] == label["id"]
    assert res.json()["estimate_points"] == 3

    # deleting the label detaches it from the story
    assert (await client.delete(
        f"/api/workspaces/acme/projects/{pid}/labels/{label['id']}/"
    )).status_code == 200
    refreshed = (await client.get(
        f"/api/workspaces/acme/projects/{pid}/stories/{story['id']}/"
    )).json()
    assert refreshed["label_ids"] == [] and refreshed["label_id"] is None
