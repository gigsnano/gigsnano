"""GIN-22 Part B: EProjectRole.VIEWER exists in the DB enum today but nothing
enforces it as read-only — a Viewer currently has full write access. These
tests pin the fix: Viewer gets 403 on representative mutating routes, still
gets 200 on reads, and a same-project Member is unaffected (regression guard)."""

SIGNUP_ADA = {
    "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
}
SIGNUP_ALAN = {
    "display_name": "Alan Turing", "email": "alan@example.test", "password": "s3cret!",
}


async def _sign_in(client, email: str, password: str = "s3cret!"):
    await client.post("/api/auth/sign-out/")
    res = await client.post("/api/auth/sign-in/", json={"email": email, "password": password})
    assert res.status_code == 200


async def setup_project_with_alan(client, role: str) -> dict:
    """Ada owns workspace 'acme' + project 'MBA'; Alan is added to the project
    with `role` ('viewer' or 'member'). Ada stays signed in on return."""
    await client.post("/api/auth/sign-up/", json=SIGNUP_ALAN)
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-up/", json=SIGNUP_ADA)
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    alan_ws = (
        await client.post("/api/workspaces/acme/members/", json={"email": "alan@example.test"})
    ).json()
    await _sign_in(client, "alan@example.test")
    await client.patch(f"/api/workspaces/acme/members/{alan_ws['id']}/", json={"accept": True})
    await _sign_in(client, "ada@example.test")
    project = (
        await client.post("/api/workspaces/acme/projects/", json={
            "name": "Mobile App", "identifier": "MBA", "flow": "fresh",
            "cover_image_url": "https://img.test/c.jpg",
        })
    ).json()
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/members/",
        json={"user_id": alan_ws["user_id"], "role": role},
    )
    assert res.status_code == 201
    return project


async def test_viewer_403_creating_story(client):
    project = await setup_project_with_alan(client, "viewer")
    await _sign_in(client, "alan@example.test")
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/stories/",
        json={"title": "Sneaky story"},
    )
    assert res.status_code == 403


async def test_viewer_403_updating_story(client):
    project = await setup_project_with_alan(client, "member")
    story = (
        await client.post(
            f"/api/workspaces/acme/projects/{project['id']}/stories/",
            json={"title": "A story"},
        )
    ).json()
    # Demote Alan to viewer after the story exists.
    members = (
        await client.get(f"/api/workspaces/acme/projects/{project['id']}/members/")
    ).json()
    alan_pm = next(m for m in members if m["email"] == "alan@example.test")
    await client.patch(
        f"/api/workspaces/acme/projects/{project['id']}/members/{alan_pm['id']}/",
        json={"role": "viewer"},
    )
    await _sign_in(client, "alan@example.test")
    res = await client.patch(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}/",
        json={"title": "Edited by a viewer"},
    )
    assert res.status_code == 403


async def test_viewer_403_deleting_story(client):
    project = await setup_project_with_alan(client, "viewer")
    story = (
        await client.post(
            f"/api/workspaces/acme/projects/{project['id']}/stories/",
            json={"title": "A story"},
        )
    ).json()
    await _sign_in(client, "alan@example.test")
    res = await client.delete(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}/"
    )
    assert res.status_code == 403


async def test_viewer_403_creating_cycle(client):
    project = await setup_project_with_alan(client, "viewer")
    await _sign_in(client, "alan@example.test")
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/cycles/",
        json={"name": "Sprint 1", "start_date": "2026-07-06", "end_date": "2026-07-20"},
    )
    assert res.status_code == 403


async def test_viewer_403_creating_module(client):
    project = await setup_project_with_alan(client, "viewer")
    await _sign_in(client, "alan@example.test")
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/modules/",
        json={"name": "Checkout"},
    )
    assert res.status_code == 403


async def test_viewer_403_updating_project(client):
    project = await setup_project_with_alan(client, "viewer")
    await _sign_in(client, "alan@example.test")
    res = await client.patch(
        f"/api/workspaces/acme/projects/{project['id']}/",
        json={"name": "Renamed by a viewer"},
    )
    assert res.status_code == 403


async def test_viewer_403_creating_label(client):
    project = await setup_project_with_alan(client, "viewer")
    await _sign_in(client, "alan@example.test")
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/labels/",
        json={"name": "urgent", "color": "#ff0000"},
    )
    assert res.status_code == 403


async def test_viewer_can_still_read(client):
    project = await setup_project_with_alan(client, "viewer")
    await _sign_in(client, "alan@example.test")
    res = await client.get(f"/api/workspaces/acme/projects/{project['id']}/stories/")
    assert res.status_code == 200
    res = await client.get(f"/api/workspaces/acme/projects/{project['id']}/cycles/")
    assert res.status_code == 200
    res = await client.get(f"/api/workspaces/acme/projects/{project['id']}/")
    assert res.status_code == 200


async def test_member_role_unaffected_by_viewer_guard(client):
    project = await setup_project_with_alan(client, "member")
    await _sign_in(client, "alan@example.test")
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/stories/",
        json={"title": "Legit story from a Member"},
    )
    assert res.status_code == 201


async def test_owner_bypasses_viewer_guard_on_own_write(client):
    """Ada (workspace Owner) is never blocked by the project-level guard,
    even without an explicit ProjectMember row (governance bypass)."""
    project = await setup_project_with_alan(client, "viewer")
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/stories/",
        json={"title": "Owner can always write"},
    )
    assert res.status_code == 201


async def test_viewer_403_deleting_an_attachment(client):
    """GIN-406 AC4: authorization is tested at the API, not by trusting that the
    UI hides the button. A read-only member calling the endpoint directly gets
    403, and the attachment is still there afterwards."""
    project = await setup_project_with_alan(client, "viewer")
    story = (await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/stories/",
        json={"title": "Ship it"},
    )).json()
    doc = (await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}/documents/",
        json={
            "title": "report.pdf", "project_id": project["id"], "story_id": story["id"],
            "file_name": "report.pdf", "mime_type": "text/markdown", "content": "# Report",
        },
    )).json()

    await _sign_in(client, "alan@example.test")
    story_scoped = (
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}"
        f"/documents/{doc['id']}/"
    )
    assert (await client.delete(story_scoped)).status_code == 403
    # ...and the same for the workspace-scoped route, so neither is a way around it.
    assert (
        await client.delete(f"/api/workspaces/acme/documents/{doc['id']}/")
    ).status_code == 403

    await _sign_in(client, "ada@example.test")
    remaining = (await client.get(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}/documents/"
    )).json()
    assert [d["id"] for d in remaining] == [doc["id"]]


async def test_member_can_delete_an_attachment(client):
    """The regression guard beside it: gating Viewer must not gate Member."""
    project = await setup_project_with_alan(client, "member")
    story = (await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/stories/",
        json={"title": "Ship it"},
    )).json()
    doc = (await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}/documents/",
        json={
            "title": "notes.md", "project_id": project["id"], "story_id": story["id"],
            "file_name": "notes.md", "mime_type": "text/markdown", "content": "# Notes",
        },
    )).json()

    await _sign_in(client, "alan@example.test")
    res = await client.delete(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}"
        f"/documents/{doc['id']}/"
    )
    assert res.status_code == 200, res.text
