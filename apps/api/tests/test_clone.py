"""GIN-355/357/359/360: work-item duplication."""

from tests.test_stories import setup_project

BASE = "/api/workspaces/acme/projects"


async def _project(client):
    return await setup_project(client)


async def _story(client, pid, **fields):
    return (await client.post(f"{BASE}/{pid}/stories/", json={"title": "Src", **fields})).json()


async def _clone(client, pid, source_id, **body):
    return await client.post(
        f"{BASE}/{pid}/stories/clone/", json={"source_id": source_id, **body}
    )


async def test_clone_creates_independent_copy_and_resets_policy_fields(client):
    project = await _project(client)
    pid = project["id"]
    me = (await client.get("/api/auth/me/")).json()
    src = await _story(
        client, pid, title="Original", description="<p>body</p>", priority="high",
        assignee_id=me["id"], status="in_progress",
    )

    r = await _clone(client, pid, src["id"])
    assert r.status_code == 201
    result = r.json()
    assert result["root_id"] != src["id"]
    assert result["root_code"] != src["code"]

    new = (await client.get(f"{BASE}/{pid}/stories/{result['root_id']}/")).json()
    assert new["title"] == "Original"
    assert new["priority"] == "high"          # copied by policy
    assert new["description"] == "<p>body</p>"  # copied
    assert new["status"] == "todo"            # reset to default open
    assert new["assignee_id"] is None         # reset
    assert new["cloned_from_id"] == src["id"]  # traceability

    # source untouched
    orig = (await client.get(f"{BASE}/{pid}/stories/{src['id']}/")).json()
    assert orig["status"] == "in_progress"
    assert orig["assignee_id"] == me["id"]


async def test_clone_overrides_win_over_policy(client):
    project = await _project(client)
    pid = project["id"]
    src = await _story(client, pid, title="Base", priority="low")
    r = await _clone(client, pid, src["id"], overrides={"title": "Edited", "priority": "urgent"})
    new = (await client.get(f"{BASE}/{pid}/stories/{r.json()['root_id']}/")).json()
    assert new["title"] == "Edited"
    assert new["priority"] == "urgent"


async def test_clone_is_idempotent(client):
    project = await _project(client)
    pid = project["id"]
    src = await _story(client, pid, title="Once")
    a = await client.post(
        f"{BASE}/{pid}/stories/clone/",
        params={"idempotency_key": "clone-1"},
        json={"source_id": src["id"]},
    )
    b = await client.post(
        f"{BASE}/{pid}/stories/clone/",
        params={"idempotency_key": "clone-1"},
        json={"source_id": src["id"]},
    )
    assert a.json()["root_id"] == b.json()["root_id"]  # one copy, replayed


async def test_clone_shifts_dates_relative(client):
    project = await _project(client)
    pid = project["id"]
    src = await _story(client, pid, start_date="2026-01-10", target_date="2026-01-20")
    r = await _clone(
        client, pid, src["id"],
        options={"dates": True, "date_mode": "shift", "new_start_date": "2026-03-10"},
    )
    new = (await client.get(f"{BASE}/{pid}/stories/{r.json()['root_id']}/")).json()
    # delta = +59 days; duration (10 days) preserved
    assert new["start_date"] == "2026-03-10"
    assert new["target_date"] == "2026-03-20"


async def test_clone_hierarchy_reparents_children(client):
    project = await _project(client)
    pid = project["id"]
    parent = await _story(client, pid, title="Parent")
    child = await _story(client, pid, title="Child", parent_id=parent["id"])

    r = await _clone(client, pid, parent["id"], options={"include_children": True})
    result = r.json()
    assert len(result["created"]) == 2

    new_parent_id = result["root_id"]
    new_child = next(c for c in result["created"] if c["id"] != new_parent_id)
    got = (await client.get(f"{BASE}/{pid}/stories/{new_child['id']}/")).json()
    assert got["parent_id"] == new_parent_id      # points to the NEW parent
    assert got["parent_id"] != parent["id"]       # never the original


async def test_clone_remaps_internal_relations(client):
    project = await _project(client)
    pid = project["id"]
    parent = await _story(client, pid, title="P")
    c1 = await _story(client, pid, title="C1", parent_id=parent["id"])
    c2 = await _story(client, pid, title="C2", parent_id=parent["id"])
    # c1 blocks c2
    await client.post(
        f"{BASE}/{pid}/stories/{c1['id']}/relations/",
        json={"relation_type": "blocking", "related_story_id": c2["id"]},
    )

    r = await _clone(client, pid, parent["id"], options={"include_children": True})
    created = r.json()["created"]
    new_ids = {c["id"] for c in created}
    new_c1 = next(c for c in created if c["title"] == "C1")

    rels = (await client.get(f"{BASE}/{pid}/stories/{new_c1['id']}/relations/")).json()
    assert rels, "internal relation should be remapped onto the copy"
    assert rels[0]["related_story_id"] in new_ids          # points at the new C2
    assert rels[0]["related_story_id"] != c2["id"]         # not the original


async def test_clone_preview_returns_prefill(client):
    project = await _project(client)
    pid = project["id"]
    src = await _story(client, pid, title="Preview me", priority="medium")
    pv = (await client.get(f"{BASE}/{pid}/stories/{src['id']}/clone-preview/")).json()
    assert pv["prefill"]["title"] == "Preview me"
    assert pv["prefill"]["priority"] == "medium"
    assert "assignee" in pv["copyable_fields"]
    assert "status" in pv["reset_fields"]


async def test_clone_missing_source_is_404(client):
    project = await _project(client)
    pid = project["id"]
    r = await _clone(client, pid, "00000000-0000-0000-0000-000000000000")
    assert r.status_code == 404
