from gigsnano_api.bmad.extraction import EXTRACTION_MODELS, EpicBreakDownExtraction
from gigsnano_api.bmad.provider import FakeProvider

CREATE_PROJECT = {
    "name": "Mobile App",
    "identifier": "MBA",
    "flow": "fresh",
    "has_ui": False,
    "cover_image_url": "https://img.test/c.jpg",
}

BREAKDOWN_PAYLOAD = {
    "title": "Notification Platform Breakdown",
    "markdown": "# Breakdown\n\nStories under G-11.",
    "stories": [
        {
            "title": "Schema + migrations",
            "description": "Add notification tables",
            "priority": "high",
            "tasks": [
                {"title": "Alembic migration", "description": ""},
            ],
        },
        {
            "title": "Email bridge",
            "description": "Wire resolve_and_notify",
            "priority": "medium",
            "tasks": [],
        },
    ],
}


async def setup(client):
    await client.post(
        "/api/auth/sign-up/",
        json={
            "display_name": "Ada Lovelace",
            "email": "ada@example.test",
            "password": "s3cret!",
        },
    )
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    return (await client.post("/api/workspaces/acme/projects/", json=CREATE_PROJECT)).json()


def test_epic_breakdown_schema_registered():
    assert "epic-breakdown" in EXTRACTION_MODELS
    parsed = EpicBreakDownExtraction.model_validate(BREAKDOWN_PAYLOAD)
    assert len(parsed.stories) == 2
    assert parsed.stories[0].tasks[0].title == "Alembic migration"


async def test_open_breakdown_thread_on_epic(client):
    project = await setup(client)
    base = f"/api/workspaces/acme/projects/{project['id']}/stories"
    epic = (await client.post(base + "/", json={"title": "G-11 Notifications", "type": "epic"})).json()

    res = await client.post(
        f"{base}/{epic['id']}/thread/",
        json={"workflow": "bmad-break-down-epic"},
    )
    assert res.status_code == 201
    body = res.json()
    assert body["workflow_id"] == "bmad-break-down-epic"
    assert body["state"] == "conversing"


async def test_break_down_finalize_creates_children(app, client):
    app.state.llm_provider = FakeProvider(extractions=[BREAKDOWN_PAYLOAD])
    project = await setup(client)
    base = f"/api/workspaces/acme/projects/{project['id']}/stories"
    epic = (await client.post(base + "/", json={"title": "G-11 Notifications", "type": "epic"})).json()

    await client.post(
        f"{base}/{epic['id']}/thread/",
        json={"workflow": "bmad-break-down-epic"},
    )
    res = await client.post(f"{base}/{epic['id']}/thread/finalize/")
    assert res.status_code == 200

    all_stories = (await client.get(base + "/")).json()["items"]
    children = [s for s in all_stories if s.get("parent_id") == epic["id"]]
    assert len(children) == 2
    assert {s["type"] for s in children} == {"story"}

    story_with_tasks = next(s for s in children if s["title"] == "Schema + migrations")
    tasks = [s for s in all_stories if s.get("parent_id") == story_with_tasks["id"]]
    assert len(tasks) == 1
    assert tasks[0]["type"] == "task"

    epic_now = next(s for s in all_stories if s["id"] == epic["id"])
    assert epic_now["sub_issue_count"] == 2
    assert epic_now["status"] == "todo"


async def test_open_breakdown_thread_409_when_children_exist(client):
    project = await setup(client)
    base = f"/api/workspaces/acme/projects/{project['id']}/stories"
    epic = (await client.post(base + "/", json={"title": "G-11 Notifications", "type": "epic"})).json()
    await client.post(
        base + "/",
        json={"title": "Existing child", "type": "story", "parent_id": epic["id"]},
    )

    res = await client.post(
        f"{base}/{epic['id']}/thread/",
        json={"workflow": "bmad-break-down-epic"},
    )
    assert res.status_code == 409
