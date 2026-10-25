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


def base(pid, sid):
    return f"/api/workspaces/acme/projects/{pid}/stories/{sid}"


# ── links ──

async def test_links_crud_and_activity(app, client):
    p = await setup(client)
    s = await make_story(client, p["id"])
    b = base(p["id"], s["id"])

    created = (await client.post(f"{b}/links/", json={"title": "Docs", "url": "https://x.test"})).json()
    assert created["title"] == "Docs" and created["url"] == "https://x.test"
    assert created["created_by_name"] == "Ada" and created["created_by_id"]

    listed = (await client.get(f"{b}/links/")).json()
    assert [x["id"] for x in listed] == [created["id"]]

    patched = (await client.patch(f"{b}/links/{created['id']}/", json={"title": "Docs v2"})).json()
    assert patched["title"] == "Docs v2" and patched["url"] == "https://x.test"

    assert (await client.delete(f"{b}/links/{created['id']}/")).json() == {"success": True}
    assert (await client.get(f"{b}/links/")).json() == []

    # activity feed logged the link add
    hist = (await client.get(f"{b}/history/")).json()
    assert any(a["field"] == "link" and a["kind"] == "property" for a in hist)


# ── relations ──

async def test_relations_crud_with_derived_key(app, client):
    p = await setup(client)
    s = await make_story(client, p["id"], "Task A")
    other = await make_story(client, p["id"], "Task B")
    b = base(p["id"], s["id"])

    rel = (await client.post(f"{b}/relations/", json={
        "relation_type": "blocking", "related_story_id": other["id"]})).json()
    assert rel["relation_type"] == "blocking"
    assert rel["related_story_title"] == "Task B"
    assert rel["related_story_key"] == f"MBA-{other['order']}"

    listed = (await client.get(f"{b}/relations/")).json()
    assert len(listed) == 1 and listed[0]["related_story_id"] == other["id"]

    assert (await client.delete(f"{b}/relations/{rel['id']}/")).json() == {"success": True}
    assert (await client.get(f"{b}/relations/")).json() == []


async def test_relation_guards_self_duplicate_and_cycles(app, client):
    """GIN-382: the relation graph rejects what can never be satisfied."""
    p = await setup(client)
    a = await make_story(client, p["id"], "A")
    b_story = await make_story(client, p["id"], "B")
    c = await make_story(client, p["id"], "C")
    ba, bb = base(p["id"], a["id"]), base(p["id"], b_story["id"])

    res = await client.post(f"{ba}/relations/", json={
        "relation_type": "relates_to", "related_story_id": a["id"]})
    assert res.status_code == 400  # self-relation

    assert (await client.post(f"{ba}/relations/", json={
        "relation_type": "blocking", "related_story_id": b_story["id"]})).status_code == 201
    dup = await client.post(f"{ba}/relations/", json={
        "relation_type": "blocking", "related_story_id": b_story["id"]})
    assert dup.status_code == 409  # identical relation

    # A blocks B; B blocks C is fine, C blocks A would close the loop.
    assert (await client.post(f"{bb}/relations/", json={
        "relation_type": "blocking", "related_story_id": c["id"]})).status_code == 201
    loop = await client.post(f"{base(p['id'], c['id'])}/relations/", json={
        "relation_type": "blocking", "related_story_id": a["id"]})
    assert loop.status_code == 409
    # ...and so would expressing the same loop from the other direction.
    loop2 = await client.post(f"{ba}/relations/", json={
        "relation_type": "blocked_by", "related_story_id": c["id"]})
    assert loop2.status_code == 409


async def test_relation_to_foreign_story_404(app, client):
    p = await setup(client)
    s = await make_story(client, p["id"])
    b = base(p["id"], s["id"])
    res = await client.post(f"{b}/relations/", json={
        "relation_type": "relates_to", "related_story_id": "does-not-exist"})
    assert res.status_code == 404


# ── comments ──

async def test_comments_crud_ordered_and_activity(app, client):
    p = await setup(client)
    s = await make_story(client, p["id"])
    b = base(p["id"], s["id"])

    c1 = (await client.post(f"{b}/comments/", json={"body": "first"})).json()
    c2 = (await client.post(f"{b}/comments/", json={"body": "second"})).json()
    assert c1["author_name"] == "Ada" and c1["author_id"]

    listed = (await client.get(f"{b}/comments/")).json()
    assert [c["id"] for c in listed] == [c1["id"], c2["id"]]  # created_at asc

    patched = (await client.patch(f"{b}/comments/{c1['id']}/", json={"body": "edited"})).json()
    assert patched["body"] == "edited"

    assert (await client.delete(f"{b}/comments/{c2['id']}/")).json() == {"success": True}
    assert len((await client.get(f"{b}/comments/")).json()) == 1

    hist = (await client.get(f"{b}/history/")).json()
    assert any(a["kind"] == "comment" for a in hist)


# ── history ──

async def test_history_created_and_property_change(app, client):
    p = await setup(client)
    s = await make_story(client, p["id"])
    b = base(p["id"], s["id"])

    hist = (await client.get(f"{b}/history/")).json()
    assert any(a["field"] == "created" and a["kind"] == "property" for a in hist)

    await client.patch(f"{b}/", json={"priority": "high"})
    hist = (await client.get(f"{b}/history/")).json()
    prio = next(a for a in hist if a["field"] == "priority")
    assert prio["new_value"] == "high" and prio["kind"] == "property"
    # newest-first ordering
    assert hist[0]["created_at"] >= hist[-1]["created_at"]


# ── subscribe ──

async def test_subscribe_toggle_idempotent(app, client):
    p = await setup(client)
    s = await make_story(client, p["id"])
    b = base(p["id"], s["id"])

    assert (await client.get(f"{b}/subscribe/")).json() == {"subscribed": False}
    assert (await client.post(f"{b}/subscribe/")).json() == {"subscribed": True}
    assert (await client.get(f"{b}/subscribe/")).json() == {"subscribed": True}
    assert (await client.post(f"{b}/subscribe/")).json() == {"subscribed": True}  # idempotent
    assert (await client.delete(f"{b}/subscribe/")).json() == {"subscribed": False}
    assert (await client.delete(f"{b}/subscribe/")).json() == {"subscribed": False}  # idempotent


# ── project-wide relations (GIN-159) ──

async def test_project_relations_returns_every_edge_in_one_call(app, client):
    """The dependency graph needs all edges at once; per-story /relations/ is N+1."""
    p = await setup(client)
    a = await make_story(client, p["id"], "A")
    b_ = await make_story(client, p["id"], "B")
    c = await make_story(client, p["id"], "C")
    await client.post(f"{base(p['id'], a['id'])}/relations/", json={
        "relation_type": "blocking", "related_story_id": b_["id"]})
    await client.post(f"{base(p['id'], b_['id'])}/relations/", json={
        "relation_type": "relates_to", "related_story_id": c["id"]})

    rows = (await client.get(f"/api/workspaces/acme/projects/{p['id']}/story-relations/")).json()

    assert {(r["story_id"], r["related_story_id"], r["relation_type"]) for r in rows} == {
        (a["id"], b_["id"], "blocking"),
        (b_["id"], c["id"], "relates_to"),
    }


async def test_project_relations_is_empty_not_error_when_none_exist(app, client):
    """Today every project has zero relations -- that must be an empty graph, not a 500."""
    p = await setup(client)
    res = await client.get(f"/api/workspaces/acme/projects/{p['id']}/story-relations/")
    assert res.status_code == 200 and res.json() == []


async def test_project_relations_drops_edges_into_deleted_stories(app, client):
    """A soft-deleted story must not leave an arrow pointing at nothing."""
    p = await setup(client)
    a = await make_story(client, p["id"], "A")
    doomed = await make_story(client, p["id"], "Doomed")
    await client.post(f"{base(p['id'], a['id'])}/relations/", json={
        "relation_type": "blocking", "related_story_id": doomed["id"]})

    await client.delete(f"/api/workspaces/acme/projects/{p['id']}/stories/{doomed['id']}/")

    rows = (await client.get(f"/api/workspaces/acme/projects/{p['id']}/story-relations/")).json()
    assert rows == []


async def test_project_relations_404s_cross_workspace(app, client):
    """Project access isn't one choke point -- every new project route carries the dep."""
    p = await setup(client)
    await client.post("/api/workspaces/", json={"name": "Other", "slug": "other"})
    res = await client.get(f"/api/workspaces/other/projects/{p['id']}/story-relations/")
    assert res.status_code == 404
