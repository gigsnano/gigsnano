from datetime import datetime

from tests.helpers import by_workflow, sprint_zero


def _moment(value: str) -> datetime:
    """Parse an API timestamp, tolerating the trailing `Z` some routes emit."""
    return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)

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


async def complete(client, project_id, story_id, extra=None):
    return await client.patch(
        f"/api/workspaces/acme/projects/{project_id}/stories/{story_id}/",
        json={"status": "done", **(extra or {})},
    )


async def test_locked_story_rejects_completion(client):
    project = await setup_project(client)
    stories = await sprint_zero(client, project["id"])
    prd = by_workflow(stories, "bmad-prd")
    res = await complete(client, project["id"], prd["id"])
    assert res.status_code == 409


async def test_completing_unlocks_dependents_transactionally(client):
    project = await setup_project(client)
    stories = await sprint_zero(client, project["id"])
    track = by_workflow(stories, "track-selection")
    res = await complete(client, project["id"], track["id"])
    assert res.status_code == 200

    stories = await sprint_zero(client, project["id"])
    assert by_workflow(stories, "bmad-prd")["bmad"]["is_locked"] is False
    assert by_workflow(stories, "bmad-brainstorming")["bmad"]["is_locked"] is False
    assert by_workflow(stories, "bmad-create-architecture")["bmad"]["is_locked"] is True

    project_now = (
        await client.get(f"/api/workspaces/acme/projects/{project['id']}/")
    ).json()
    assert project_now["sprint_zero_status"] == "in_progress"
    assert project_now["sprint_zero_progress"] == 10  # 1/10 done


async def test_skip_story_counts_as_satisfied(client):
    project = await setup_project(client)
    stories = await sprint_zero(client, project["id"])
    track = by_workflow(stories, "track-selection")
    res = await client.patch(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{track['id']}/",
        json={"skipped": True},
    )
    assert res.json()["bmad"]["skipped"] is True
    stories = await sprint_zero(client, project["id"])
    assert by_workflow(stories, "bmad-prd")["bmad"]["is_locked"] is False


async def test_readiness_gate_pass_unlocks_sprint_planning(client):
    project = await setup_project(client)
    stories = await sprint_zero(client, project["id"])
    # Walk the chain: track → prd → ux → architecture → epics → readiness(pass)
    for w in ("track-selection", "bmad-prd", "bmad-ux", "bmad-create-architecture",
              "bmad-create-epics-and-stories"):
        await complete(client, project["id"], by_workflow(stories, w)["id"])
        stories = await sprint_zero(client, project["id"])
    gate = by_workflow(stories, "bmad-check-implementation-readiness")
    await complete(client, project["id"], gate["id"], {"readiness_result": "concerns"})
    stories = await sprint_zero(client, project["id"])
    assert by_workflow(stories, "bmad-sprint-planning")["bmad"]["is_locked"] is True

    # Re-run the gate with PASS
    res = await client.patch(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{gate['id']}/",
        json={"readiness_result": "pass"},
    )
    assert res.status_code == 200
    stories = await sprint_zero(client, project["id"])
    assert by_workflow(stories, "bmad-sprint-planning")["bmad"]["is_locked"] is False


async def test_update_story_description_persists(client):
    """GIN-78: editing a work-item description (here a task/todo list) must save,
    not 500. Regression for `update_story` referencing `activity_old` (local to
    `_apply_story_update`) out of scope, which made every description PATCH raise
    NameError -> the edit never persisted (todos "did not save")."""
    project = await setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}/stories/"
    story = (await client.post(base, json={"title": "Task with todos"})).json()
    html = (
        '<ul data-type="taskList"><li data-checked="true">'
        "<label><input type=\"checkbox\" checked></label><div><p>done item</p></div>"
        "</li></ul>"
    )

    res = await client.patch(f"{base}{story['id']}/", json={"description": html})
    assert res.status_code == 200

    got = (await client.get(f"{base}{story['id']}/")).json()
    assert got["description"] == html


async def test_create_ordinary_story_and_sub_stories(client):
    project = await setup_project(client)
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/stories/",
        json={"title": "Implement login"},
    )
    assert res.status_code == 201
    parent = res.json()
    assert parent["bmad"] is None
    assert parent["order"] == 10  # after the 10 seeded Sprint-0 stories

    child = (
        await client.post(
            f"/api/workspaces/acme/projects/{project['id']}/stories/",
            json={"title": "Login form", "parent_id": parent["id"]},
        )
    ).json()
    subs = (
        await client.get(
            f"/api/workspaces/acme/projects/{project['id']}/stories/{parent['id']}/sub-stories/"
        )
    ).json()
    assert [s["id"] for s in subs] == [child["id"]]

    fetched = (
        await client.get(
            f"/api/workspaces/acme/projects/{project['id']}/stories/{parent['id']}/"
        )
    ).json()
    assert fetched["sub_issue_count"] == 1


async def test_my_stories_and_workspace_stories(client):
    project = await setup_project(client)
    me = (await client.get("/api/auth/me/")).json()
    story = (
        await client.post(
            f"/api/workspaces/acme/projects/{project['id']}/stories/",
            json={"title": "Assigned work"},
        )
    ).json()
    await client.patch(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}/",
        json={"assignee_id": me["id"]},
    )

    mine = (await client.get("/api/workspaces/acme/my-stories/")).json()["items"]
    assert len(mine) == 1
    assert mine[0]["project_name"] == "Mobile App"
    assert mine[0]["project_identifier"] == "MBA"

    all_stories = (await client.get("/api/workspaces/acme/stories/")).json()["items"]
    assert len(all_stories) == 11  # 10 seeded + 1 created


async def test_workspace_stories_search_matches_title_and_description(client):
    # GIN-35 global search: q matches work-item title OR description.
    project = await setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}/stories/"
    await client.post(base, json={"title": "Zebra migration plan"})
    await client.post(
        base, json={"title": "Ordinary task", "description": "<p>needs a quokka review</p>"}
    )

    by_title = (await client.get("/api/workspaces/acme/stories/?q=zebra")).json()["items"]
    assert [s["title"] for s in by_title] == ["Zebra migration plan"]

    by_desc = (await client.get("/api/workspaces/acme/stories/?q=quokka")).json()["items"]
    assert [s["title"] for s in by_desc] == ["Ordinary task"]


async def test_workspace_search_matches_exact_code(client):
    # GIN-365 AC1: searching an exact work-item code returns that item first. The
    # code is computed (identifier-number), so the old title/description-only search
    # never found it.
    project = await setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}/stories/"
    created = (await client.post(base, json={"title": "Totally unrelated heading"})).json()
    code = created["code"]
    assert code  # e.g. "MBA-11"

    hits = (await client.get(f"/api/workspaces/acme/stories/?q={code}")).json()["items"]
    assert hits, "exact-code search must return the item"
    assert hits[0]["code"] == code


async def test_workspace_search_ranks_exact_title_above_description(client):
    # GIN-365 AC2: an exact title match outranks a description-only match.
    project = await setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}/stories/"
    await client.post(
        base, json={"title": "Ordinary chore", "description": "<p>mentions Inbox somewhere</p>"}
    )
    await client.post(base, json={"title": "Inbox"})

    hits = (await client.get("/api/workspaces/acme/stories/?q=Inbox")).json()["items"]
    assert hits[0]["title"] == "Inbox"


async def test_workspace_search_ranks_title_hit_above_description_hit(client):
    # GIN-365 AC3: an item with the term in its title outranks one that only has it
    # in the description (the "Inbox returned unrelated billing items" bug).
    project = await setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}/stories/"
    await client.post(
        base, json={"title": "Billing overhaul", "description": "<p>see the inbox</p>"}
    )
    await client.post(base, json={"title": "Inbox triage board"})

    hits = (await client.get("/api/workspaces/acme/stories/?q=inbox")).json()["items"]
    assert hits[0]["title"] == "Inbox triage board"


async def test_workspace_search_multiword_recall(client):
    # GIN-365: multi-word queries match items containing each term anywhere, not only
    # the exact adjacent phrase the old single-substring ILIKE required.
    project = await setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}/stories/"
    await client.post(
        base, json={"title": "Fix workspace mutable state during isolation checks"}
    )

    hits = (await client.get("/api/workspaces/acme/stories/?q=workspace isolation")).json()[
        "items"
    ]
    assert any("workspace" in s["title"].lower() for s in hits)


async def _new_story(client, project_id, **fields):
    return (
        await client.post(
            f"/api/workspaces/acme/projects/{project_id}/stories/",
            json={"title": "Temp", **fields},
        )
    ).json()


async def _project_story_ids(client, project_id):
    items = (
        await client.get(f"/api/workspaces/acme/projects/{project_id}/stories/")
    ).json()["items"]
    return {s["id"] for s in items}


async def _trash_ids(client):
    items = (await client.get("/api/workspaces/acme/trash/")).json()["items"]
    return {s["id"] for s in items}


async def test_delete_soft_deletes_into_trash(client):
    project = await setup_project(client)
    story = await _new_story(client, project["id"], title="Temp")

    res = await client.delete(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}/"
    )
    assert res.json() == {"success": True}

    # Gone from every normal read (project list + workspace list), present in trash.
    assert story["id"] not in await _project_story_ids(client, project["id"])
    ws = (await client.get("/api/workspaces/acme/stories/")).json()["items"]
    assert story["id"] not in {s["id"] for s in ws}

    trash = (await client.get("/api/workspaces/acme/trash/")).json()["items"]
    assert [s["id"] for s in trash] == [story["id"]]
    assert trash[0]["project_identifier"] == "MBA"
    assert trash[0]["deleted_at"] is not None
    assert trash[0]["deleted_by_id"] is not None


async def test_restore_brings_item_back(client):
    project = await setup_project(client)
    story = await _new_story(client, project["id"], title="Temp")
    await client.delete(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}/"
    )

    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}/restore/"
    )
    assert res.status_code == 200
    assert story["id"] in await _project_story_ids(client, project["id"])
    assert await _trash_ids(client) == set()


async def test_purge_permanently_removes(client):
    project = await setup_project(client)
    story = await _new_story(client, project["id"], title="Temp")
    await client.delete(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}/"
    )

    res = await client.delete(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}/purge/"
    )
    assert res.json() == {"success": True}
    assert await _trash_ids(client) == set()
    # Restore after purge is a 404 — the row is gone.
    gone = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}/restore/"
    )
    assert gone.status_code == 404


async def test_delete_detach_keeps_children_live(client):
    project = await setup_project(client)
    parent = await _new_story(client, project["id"], title="Parent", type="epic")
    child = await _new_story(
        client, project["id"], title="Child", parent_id=parent["id"]
    )

    # Default cascade=detach: only the parent is trashed; the child stays live.
    await client.delete(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{parent['id']}/"
    )
    live = await _project_story_ids(client, project["id"])
    assert child["id"] in live and parent["id"] not in live
    assert await _trash_ids(client) == {parent["id"]}

    fetched_child = (
        await client.get(
            f"/api/workspaces/acme/projects/{project['id']}/stories/{child['id']}/"
        )
    ).json()
    assert fetched_child["parent_id"] is None  # detached


async def test_delete_cascade_children_and_restore_subtree(client):
    project = await setup_project(client)
    parent = await _new_story(client, project["id"], title="Parent", type="epic")
    child = await _new_story(
        client, project["id"], title="Child", parent_id=parent["id"]
    )

    # cascade=children trashes the whole subtree together.
    await client.delete(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{parent['id']}/"
        "?cascade=children"
    )
    assert await _trash_ids(client) == {parent["id"], child["id"]}
    assert await _project_story_ids(client, project["id"]) & {
        parent["id"],
        child["id"],
    } == set()

    # Restoring the parent brings the child back too (re-walked via parent_id).
    await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{parent['id']}/restore/"
    )
    live = await _project_story_ids(client, project["id"])
    assert {parent["id"], child["id"]} <= live
    assert await _trash_ids(client) == set()


async def _sibling_project_and_cycle(client, project):
    """A second project in the same workspace, with its own cycle."""
    sibling = (
        await client.post(
            "/api/workspaces/acme/projects/",
            json={**CREATE_PROJECT, "identifier": "SIB"},
        )
    ).json()
    assert sibling["id"] != project["id"]
    cycle = (
        await client.post(
            f"/api/workspaces/acme/projects/{sibling['id']}/cycles/",
            json={"name": "Sibling Cycle"},
        )
    ).json()
    return sibling, cycle


async def test_create_story_rejects_cross_project_cycle_id(client):
    project = await setup_project(client)
    _sibling, foreign_cycle = await _sibling_project_and_cycle(client, project)

    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/stories/",
        json={"title": "Sneaky", "cycle_id": foreign_cycle["id"]},
    )
    assert res.status_code == 404

    # Not persisted anywhere, and the sibling's cycle-stories list stays empty.
    all_stories = (
        await client.get(f"/api/workspaces/acme/projects/{project['id']}/stories/")
    ).json()["items"]
    assert all(s["title"] != "Sneaky" for s in all_stories)
    sibling_cycle_stories = (
        await client.get(
            f"/api/workspaces/acme/projects/{_sibling['id']}/cycles/{foreign_cycle['id']}/stories/"
        )
    ).json()
    assert sibling_cycle_stories == []


async def test_update_story_rejects_cross_project_parent_id(client):
    project = await setup_project(client)
    _sibling, _cycle = await _sibling_project_and_cycle(client, project)
    foreign_story = (
        await client.post(
            f"/api/workspaces/acme/projects/{_sibling['id']}/stories/",
            json={"title": "Foreign parent"},
        )
    ).json()
    own_story = (
        await client.post(
            f"/api/workspaces/acme/projects/{project['id']}/stories/",
            json={"title": "Mine"},
        )
    ).json()

    res = await client.patch(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{own_story['id']}/",
        json={"parent_id": foreign_story["id"]},
    )
    assert res.status_code == 404

    fetched = (
        await client.get(
            f"/api/workspaces/acme/projects/{project['id']}/stories/{own_story['id']}/"
        )
    ).json()
    assert fetched["parent_id"] is None


async def test_manual_story_ai_agent_assign_swap_clear(client):
    project = await setup_project(client)
    pid = project["id"]
    created = await client.post(
        f"/api/workspaces/acme/projects/{pid}/stories/",
        json={"title": "Build login form"},
    )
    assert created.status_code == 201
    story = created.json()
    assert story["ai_agent_id"] is None  # serialized field present, defaults null
    sid = story["id"]
    url = f"/api/workspaces/acme/projects/{pid}/stories/{sid}/"

    # assign
    res = await client.patch(url, json={"ai_agent_id": "agent_pm"})
    assert res.status_code == 200
    assert res.json()["ai_agent_id"] == "agent_pm"

    # swap
    res = await client.patch(url, json={"ai_agent_id": "agent_architect"})
    assert res.status_code == 200
    assert res.json()["ai_agent_id"] == "agent_architect"

    # clear (explicit null)
    res = await client.patch(url, json={"ai_agent_id": None})
    assert res.status_code == 200
    assert res.json()["ai_agent_id"] is None


async def test_unknown_ai_agent_rejected(client):
    project = await setup_project(client)
    pid = project["id"]
    sid = (
        await client.post(
            f"/api/workspaces/acme/projects/{pid}/stories/",
            json={"title": "Anything"},
        )
    ).json()["id"]
    res = await client.patch(
        f"/api/workspaces/acme/projects/{pid}/stories/{sid}/",
        json={"ai_agent_id": "agent_bogus"},
    )
    assert res.status_code == 400


async def test_create_story_accepts_full_draft(client):
    project = await setup_project(client)
    pid = project["id"]
    base = f"/api/workspaces/acme/projects/{pid}/stories/"
    created = (await client.post(base, json={
        "title": "Fully specified",
        "type": "task",
        "priority": "high",
        "start_date": "2026-07-10",
        "target_date": "2026-07-20",
    })).json()
    assert created["type"] == "task"
    assert created["priority"] == "high"
    assert created["start_date"] == "2026-07-10"
    assert created["target_date"] == "2026-07-20"


async def test_story_type_defaults_to_story_settable_on_create_and_update(client):
    project = await setup_project(client)
    pid = project["id"]
    base = f"/api/workspaces/acme/projects/{pid}/stories/"

    # Default type is "story" when omitted.
    created = (await client.post(base, json={"title": "Plain item"})).json()
    assert created["type"] == "story"

    # Explicit type accepted on create.
    epic = (await client.post(base, json={"title": "Big epic", "type": "epic"})).json()
    assert epic["type"] == "epic"

    # Type is patchable, and the change round-trips through GET.
    patched = (await client.patch(f"{base}{created['id']}/", json={"type": "bug"})).json()
    assert patched["type"] == "bug"
    got = (await client.get(f"{base}{created['id']}/")).json()
    assert got["type"] == "bug"


async def test_assignee_must_be_active_project_member(client):
    project = await setup_project(client)
    pid = project["id"]
    base = f"/api/workspaces/acme/projects/{pid}/stories/"

    # A non-member id is rejected on create.
    res = await client.post(base, json={"title": "x", "assignee_id": "u_ghost"})
    assert res.status_code == 400

    # The project creator (an active member) is accepted on create.
    me = (await client.get("/api/auth/me/")).json()
    created = (await client.post(base, json={"title": "y", "assignee_id": me["id"]})).json()
    assert created["assignee_id"] == me["id"]

    # A non-member id is rejected on update too.
    plain = (await client.post(base, json={"title": "z"})).json()
    res = await client.patch(f"{base}{plain['id']}/", json={"assignee_id": "u_ghost"})
    assert res.status_code == 400


async def test_backdating_created_at_persists_and_is_logged(client):
    """GIN-527: imported work must be able to carry its real date. Every
    date-windowed view reads created_at, so items stuck on the import date
    report a spike that never happened."""
    project = await setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}/stories/"
    story = (await client.post(base, json={"title": "Imported from Jira"})).json()

    res = await client.patch(f"{base}{story['id']}/", json={"created_at": "2026-03-14T09:30:00Z"})
    assert res.status_code == 200
    assert res.json()["created_at"].startswith("2026-03-14T09:30:00")

    # Re-read: it stuck, rather than only appearing in the response.
    assert (await client.get(f"{base}{story['id']}/")).json()["created_at"].startswith(
        "2026-03-14T09:30:00"
    )

    # Silently rewriting history is the real risk, so the change is in the feed.
    history = (await client.get(f"{base}{story['id']}/history/")).json()
    assert any(h["field"] == "created" for h in history)


async def test_backdating_rejects_a_future_created_at(client):
    """A future creation date isn't a correction — it would drop the item out of
    every "last N days" window until that date arrived."""
    project = await setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}/stories/"
    story = (await client.post(base, json={"title": "Time traveller"})).json()

    res = await client.patch(f"{base}{story['id']}/", json={"created_at": "2099-01-01T00:00:00Z"})
    assert res.status_code == 422
    assert "future" in res.json()["detail"].lower()


async def test_update_without_created_at_leaves_it_alone(client):
    """An ordinary PATCH must not disturb the creation date.

    Compared as instants, not strings: POST serializes with a trailing `Z` and
    PATCH without it (pre-existing, both mean UTC), which is a difference in
    formatting rather than in the value.
    """
    project = await setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}/stories/"
    story = (await client.post(base, json={"title": "Untouched"})).json()

    res = await client.patch(f"{base}{story['id']}/", json={"title": "Renamed"})
    assert res.status_code == 200
    assert _moment(res.json()["created_at"]) == _moment(story["created_at"])
