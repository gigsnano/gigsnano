"""GIN-138: Execute GigsQL on story list endpoints before pagination."""

from urllib.parse import quote

from tests.test_stories import setup_project


async def _create_story(client, project_id, **fields):
    return (
        await client.post(
            f"/api/workspaces/acme/projects/{project_id}/stories/",
            json={"title": fields.pop("title", "Story"), **fields},
        )
    ).json()


async def _list_project_stories(client, project_id, **params):
    query = "&".join(f"{k}={quote(str(v))}" for k, v in params.items() if v is not None)
    url = f"/api/workspaces/acme/projects/{project_id}/stories/"
    if query:
        url = f"{url}?{query}"
    return (await client.get(url)).json()


async def _list_workspace_stories(client, **params):
    query = "&".join(f"{k}={quote(str(v))}" for k, v in params.items() if v is not None)
    url = "/api/workspaces/acme/stories/"
    if query:
        url = f"{url}?{query}"
    return (await client.get(url)).json()


async def test_gigsql_and_status_priority(client):
    project = await setup_project(client)
    pid = project["id"]
    match = await _create_story(
        client, pid, title="Match", status="todo", priority="high"
    )
    await _create_story(client, pid, title="Wrong priority", status="todo", priority="low")
    await _create_story(client, pid, title="Wrong status", status="done", priority="high")

    page = await _list_project_stories(
        client,
        pid,
        product_only=True,
        gigsql="status = todo AND priority = high",
    )
    assert [s["id"] for s in page["items"]] == [match["id"]]
    assert page["total"] == 1


async def test_gigsql_colon_shorthand_on_project_stories(client):
    project = await setup_project(client)
    pid = project["id"]
    match = await _create_story(
        client, pid, title="Match", status="todo", priority="high"
    )
    await _create_story(client, pid, title="Wrong priority", status="todo", priority="low")
    await _create_story(client, pid, title="Wrong status", status="done", priority="high")

    page = await _list_project_stories(
        client,
        pid,
        product_only=True,
        gigsql="status:todo priority:high",
    )
    assert [s["id"] for s in page["items"]] == [match["id"]]
    assert page["total"] == 1


async def test_gigsql_workspace_stories(client):
    project = await setup_project(client)
    pid = project["id"]
    match = await _create_story(
        client, pid, title="Workspace match", status="todo", priority="high"
    )
    await _create_story(client, pid, title="Wrong priority", status="todo", priority="low")
    await _create_story(client, pid, title="Wrong status", status="done", priority="high")

    page = await _list_workspace_stories(
        client,
        product_only=True,
        gigsql="status = todo AND priority = high",
    )
    assert [s["id"] for s in page["items"]] == [match["id"]]
    assert page["total"] == 1


async def test_gigsql_or_status(client):
    project = await setup_project(client)
    pid = project["id"]
    todo = await _create_story(client, pid, title="Todo item", status="todo")
    in_progress = await _create_story(
        client, pid, title="Active item", status="in_progress"
    )
    await _create_story(client, pid, title="Done item", status="done")

    page = await _list_project_stories(
        client,
        pid,
        product_only=True,
        gigsql="status = todo OR status = in_progress",
    )
    ids = {s["id"] for s in page["items"]}
    assert ids == {todo["id"], in_progress["id"]}
    assert page["total"] == 2


async def test_gigsql_due_date_gte(client):
    project = await setup_project(client)
    pid = project["id"]
    early = await _create_story(
        client, pid, title="Early", target_date="2026-07-01"
    )
    late = await _create_story(
        client, pid, title="Late", target_date="2026-07-15"
    )
    await _create_story(client, pid, title="No due date")

    page = await _list_project_stories(
        client,
        pid,
        product_only=True,
        gigsql="dueDate >= 2026-07-10",
    )
    ids = {s["id"] for s in page["items"]}
    assert ids == {late["id"]}
    assert early["id"] not in ids
    assert page["total"] == 1


async def test_gigsql_assignee_is_null(client):
    project = await setup_project(client)
    pid = project["id"]
    me = (await client.get("/api/auth/me/")).json()
    assigned = await _create_story(
        client, pid, title="Assigned", assignee_id=me["id"]
    )
    unassigned = await _create_story(client, pid, title="Unassigned")

    page = await _list_project_stories(
        client,
        pid,
        product_only=True,
        gigsql="assignee is null",
    )
    ids = {s["id"] for s in page["items"]}
    assert unassigned["id"] in ids
    assert assigned["id"] not in ids


async def test_gigsql_filters_before_pagination(client):
    project = await setup_project(client)
    pid = project["id"]
    for i in range(3):
        await _create_story(
            client, pid, title=f"High {i}", status="todo", priority="high"
        )
    for i in range(2):
        await _create_story(
            client, pid, title=f"Low {i}", status="todo", priority="low"
        )

    page = await _list_project_stories(
        client,
        pid,
        product_only=True,
        gigsql="status = todo AND priority = high",
        limit=2,
        offset=0,
    )
    assert len(page["items"]) == 2
    assert page["total"] == 3
    assert page["limit"] == 2
    assert page["offset"] == 0


async def test_gigsql_rejects_code_analysis_on_work_item_endpoint(client):
    project = await setup_project(client)
    pid = project["id"]
    res = await client.get(
        f"/api/workspaces/acme/projects/{pid}/stories/?gigsql={quote('severity = high')}"
    )
    assert res.status_code == 422


async def test_gigsql_and_structured_filters(client):
    project = await setup_project(client)
    pid = project["id"]
    match = await _create_story(
        client, pid, title="Both", status="todo", priority="high"
    )
    await _create_story(
        client, pid, title="GigsQL only", status="in_progress", priority="high"
    )
    await _create_story(
        client, pid, title="Structured only", status="todo", priority="low"
    )

    page = await _list_project_stories(
        client,
        pid,
        product_only=True,
        status="todo",
        gigsql="priority = high",
    )
    assert [s["id"] for s in page["items"]] == [match["id"]]
    assert page["total"] == 1
