"""Dashboard-wide project filter: `project_ids` narrows every widget data source,
and a published board applies its stored filter server-side."""

from gigsnano_api.shared.context import narrow_project_ids


async def _two_projects(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    ids = []
    for name, ident in (("Mobile App", "MBA"), ("Web App", "WEB")):
        project = (
            await client.post("/api/workspaces/acme/projects/", json={
                "name": name, "identifier": ident, "flow": "fresh",
                "cover_image_url": "https://img.test/c.jpg",
            })
        ).json()
        ids.append(project["id"])
    return ids


def test_narrow_keeps_only_requested_ids_the_caller_can_see():
    # Admin (None = all) is narrowed to exactly the request.
    assert narrow_project_ids(None, "a,b") == ["a", "b"]
    # A member can never widen past their own projects.
    assert narrow_project_ids(["a", "c"], "a,b") == ["a"]
    assert narrow_project_ids(["c"], "a,b") == []
    # Absent / blank request = no narrowing.
    assert narrow_project_ids(["a"], None) == ["a"]
    assert narrow_project_ids(None, " , ") is None


async def test_metrics_scope_to_the_requested_projects(client):
    p1, p2 = await _two_projects(client)
    base = "/api/workspaces/acme/dashboards/metrics/"
    everything = (await client.get(base)).json()["total"]
    only_p1 = (await client.get(f"{base}?project_ids={p1}")).json()["total"]
    single = (await client.get(f"{base}?project_id={p1}")).json()["total"]
    both = (await client.get(f"{base}?project_ids={p1},{p2}")).json()["total"]

    assert 0 < only_p1 < everything
    assert only_p1 == single
    assert both == everything


async def test_activity_and_planned_accept_project_ids(client):
    p1, _ = await _two_projects(client)
    for path in ("activity", "planned"):
        res = await client.get(f"/api/workspaces/acme/dashboards/{path}/?project_ids={p1}")
        assert res.status_code == 200


async def test_analytics_scope_to_the_requested_projects(client):
    p1, _ = await _two_projects(client)
    a = (await client.get(f"/api/workspaces/acme/analytics/?project_ids={p1}")).json()
    assert a["total_projects"] == 1
    assert [p["project_id"] for p in a["project_progress"]] == [p1]


async def test_workspace_stories_scope_to_the_requested_projects(client):
    p1, _ = await _two_projects(client)
    page = (
        await client.get(f"/api/workspaces/acme/stories/?project_ids={p1}&limit=100")
    ).json()
    assert page["items"]
    assert {s["project_id"] for s in page["items"]} == {p1}


async def test_published_board_applies_its_stored_project_filter(client):
    p1, _ = await _two_projects(client)
    config = {
        "widgets": [
            {"id": "w_status", "type": "status_chart", "title": "Status",
             "x": 0, "y": 0, "w": 4, "h": 4, "settings": {}},
        ],
        "filters": {"project_ids": [p1], "date_range": "30d"},
    }
    dashboard = (
        await client.post("/api/workspaces/acme/dashboards/", json={"name": "D", "config": config})
    ).json()
    token = (
        await client.post(
            f"/api/workspaces/acme/dashboards/{dashboard['id']}/share/",
            json={"visibility": "public"},
        )
    ).json()["public_token"]

    only_p1 = (
        await client.get(f"/api/workspaces/acme/dashboards/metrics/?project_ids={p1}")
    ).json()["total"]
    public = (
        await client.get(f"/api/public/dashboards/{token}/widgets/w_status/metrics/")
    ).json()["total"]
    assert public == only_p1

    board = (await client.get(f"/api/public/dashboards/{token}/")).json()
    # The date window travels (the page resolves it); project ids never do.
    assert board["filters"] == {"date_range": "30d", "date_from": None, "date_to": None}
