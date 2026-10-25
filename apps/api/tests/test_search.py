from sqlalchemy import select

from gigsnano_api.models import WorkspaceInvitation
from tests.test_stories import setup_project


async def test_search_groups_across_entities(client):
    project = await setup_project(client)
    base = f"/api/workspaces/acme/projects/{project['id']}/stories/"
    await client.post(base, json={"title": "Zebra login"})
    res = (await client.get("/api/workspaces/acme/search/?q=zebra")).json()
    assert "work_items" in res and "projects" in res
    assert any("Zebra" in w["title"] for w in res["work_items"])


async def test_search_scopes_work_items_to_accessible_projects(client, db_session):
    # Ada owns 'acme' with two projects. Grace is a workspace member but only a
    # project member of Alpha — Beta's "Zebra" story must never reach her search.
    ada = await setup_project(client)  # creates 'Mobile App' / MBA as project A ("Alpha")
    project_b = (
        await client.post(
            "/api/workspaces/acme/projects/",
            json={"name": "Beta", "identifier": "BET", "flow": "fresh",
                  "cover_image_url": "https://img.test/b.jpg"},
        )
    ).json()

    await client.post(
        f"/api/workspaces/acme/projects/{ada['id']}/stories/", json={"title": "Zebra visible"}
    )
    await client.post(
        f"/api/workspaces/acme/projects/{project_b['id']}/stories/", json={"title": "Zebra secret"}
    )

    invite_res = await client.post(
        "/api/workspaces/acme/members/", json={"email": "grace@example.test", "role": "member"}
    )
    assert invite_res.status_code == 201
    token = (
        await db_session.execute(
            select(WorkspaceInvitation).where(WorkspaceInvitation.email == "grace@example.test")
        )
    ).scalar_one().token

    await client.post("/api/auth/sign-out/")
    await client.post(
        "/api/auth/sign-up/",
        json={"display_name": "Grace Hopper", "email": "grace@example.test", "password": "s3cret!"},
    )
    accept = await client.post(f"/api/auth/invitations/{token}/accept/", json={})
    assert accept.status_code == 200
    await client.post("/api/auth/sign-out/")

    # Back to Ada to grant Grace project-level access to Alpha only.
    await client.post(
        "/api/auth/sign-in/", json={"email": "ada@example.test", "password": "s3cret!"}
    )
    add_member = await client.post(
        f"/api/workspaces/acme/projects/{ada['id']}/members/",
        json={"email": "grace@example.test", "role": "member"},
    )
    assert add_member.status_code == 201
    await client.post("/api/auth/sign-out/")

    await client.post(
        "/api/auth/sign-in/", json={"email": "grace@example.test", "password": "s3cret!"}
    )
    res = (await client.get("/api/workspaces/acme/search/?q=zebra")).json()
    titles = {w["title"] for w in res["work_items"]}
    assert titles == {"Zebra visible"}


async def test_search_filters_by_scope_project(client):
    # Ada owns 'acme' with two projects. Search with scope=project restricts
    # results to the specified project even when both contain matching stories.
    project_a = await setup_project(client)  # creates 'Mobile App' / MBA
    project_b = (
        await client.post(
            "/api/workspaces/acme/projects/",
            json={"name": "Search Target", "identifier": "TRG", "flow": "fresh",
                  "cover_image_url": "https://img.test/b.jpg"},
        )
    ).json()

    await client.post(
        f"/api/workspaces/acme/projects/{project_a['id']}/stories/",
        json={"title": "UNIQUE_REGEX_AUTH_TOKEN"}
    )
    await client.post(
        f"/api/workspaces/acme/projects/{project_b['id']}/stories/",
        json={"title": "UNIQUE_REGEX_DATABASE_LAYER"}
    )

    # Search for 'unique_regex' across workspace (no scope restriction).
    res = (await client.get("/api/workspaces/acme/search/?q=unique_regex")).json()
    assert len(res["work_items"]) == 2

    # Search for 'unique_regex' restricted to project_a only.
    res_filtered = (
        await client.get(
            f"/api/workspaces/acme/search/?q=unique_regex&scope=project&project_id={project_a['id']}"
        )
    ).json()
    assert len(res_filtered["work_items"]) == 1
    assert res_filtered["work_items"][0]["project_id"] == project_a["id"]
    assert "auth" in res_filtered["work_items"][0]["title"].lower()
