import json


async def setup(client):
    """Ada owns workspace acme + project MBA; Alan is an ACTIVE workspace member (no project membership)."""
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Alan Turing", "email": "alan@example.test", "password": "s3cret!",
    })
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    alan_ws = (
        await client.post("/api/workspaces/acme/members/", json={"email": "alan@example.test"})
    ).json()
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-in/", json={"email": "alan@example.test", "password": "s3cret!"})
    await client.patch(f"/api/workspaces/acme/members/{alan_ws['id']}/", json={"accept": True})
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-in/", json={"email": "ada@example.test", "password": "s3cret!"})
    project = (
        await client.post("/api/workspaces/acme/projects/", json={
            "name": "Mobile App", "identifier": "MBA", "flow": "fresh",
            "cover_image_url": "https://img.test/c.jpg",
        })
    ).json()
    return project, alan_ws


async def _login(client, email):
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-in/", json={"email": email, "password": "s3cret!"})


async def test_non_member_cannot_open_project(client):
    project, _ = await setup(client)
    await _login(client, "alan@example.test")  # workspace member, not a project member
    res = await client.get(f"/api/workspaces/acme/projects/{project['id']}/")
    assert res.status_code == 404


async def test_project_member_can_open_project(client):
    project, alan_ws = await setup(client)
    await client.post(  # Ada (project admin) adds Alan to MBA
        f"/api/workspaces/acme/projects/{project['id']}/members/",
        json={"user_id": alan_ws["user_id"]},
    )
    await _login(client, "alan@example.test")
    res = await client.get(f"/api/workspaces/acme/projects/{project['id']}/")
    assert res.status_code == 200


async def test_owner_can_open_project_they_are_not_member_of(client):
    _project, _ = await setup(client)
    await _login(client, "alan@example.test")  # a plain member may create a project
    alan_proj = (
        await client.post("/api/workspaces/acme/projects/", json={
            "name": "Alan Svc", "identifier": "ASV", "flow": "fresh",
            "cover_image_url": "https://img.test/c.jpg",
        })
    ).json()
    await _login(client, "ada@example.test")  # workspace OWNER, not a member of ASV
    res = await client.get(f"/api/workspaces/acme/projects/{alan_proj['id']}/")
    assert res.status_code == 200  # governance bypass


async def test_list_shows_only_member_projects(client):
    _project, _ = await setup(client)
    await _login(client, "alan@example.test")  # member of no project
    res = await client.get("/api/workspaces/acme/projects/")
    assert res.status_code == 200
    assert [p["id"] for p in res.json()] == []


async def test_admin_all_flag_reveals_non_member_projects(client):
    project, _ = await setup(client)  # Ada owns MBA
    await _login(client, "alan@example.test")
    alan_proj = (
        await client.post("/api/workspaces/acme/projects/", json={
            "name": "Alan Svc", "identifier": "ASV", "flow": "fresh",
            "cover_image_url": "https://img.test/c.jpg",
        })
    ).json()
    await _login(client, "ada@example.test")  # OWNER, not a member of ASV
    default_ids = [p["id"] for p in (await client.get("/api/workspaces/acme/projects/")).json()]
    all_ids = [p["id"] for p in (await client.get("/api/workspaces/acme/projects/?all=true")).json()]
    assert alan_proj["id"] not in default_ids   # hidden by default
    assert project["id"] in default_ids         # her own project shows
    assert set(all_ids) >= {project["id"], alan_proj["id"]}  # governance view reveals all


async def test_all_flag_ignored_for_non_admin(client):
    _project, _ = await setup(client)
    await _login(client, "alan@example.test")
    res = await client.get("/api/workspaces/acme/projects/?all=true")
    assert [p["id"] for p in res.json()] == []  # still membership-filtered


async def test_by_repo_requires_project_membership(client, db_session):
    from gigsnano_api.models import Project

    project, _ = await setup(client)  # Ada owns MBA
    p = await db_session.get(Project, project["id"])  # give MBA a repo to match on
    p.repo_full_name = "acme/mobile"
    await db_session.commit()

    await _login(client, "alan@example.test")  # workspace member, not a project member
    res = await client.get("/api/projects/by-repo?full_name=acme/mobile")
    assert res.status_code == 404

    await _login(client, "ada@example.test")  # OWNER → bypass
    res = await client.get("/api/projects/by-repo?full_name=acme/mobile")
    assert res.status_code == 200
    assert res.json()["project_id"] == project["id"]


async def test_non_member_cannot_list_or_read_documents(client):
    project, _ = await setup(client)  # Ada owns MBA (still logged in as Ada)
    stories = (
        await client.get(f"/api/workspaces/acme/projects/{project['id']}/sprint-zero/stories/")
    ).json()
    story_id = stories[0]["id"]
    doc = (
        await client.post(
            f"/api/workspaces/acme/projects/{project['id']}/stories/{story_id}/documents/",
            json={
                "title": "Notes",
                "project_id": project["id"],
                "story_id": story_id,
                "file_name": "notes.md",
                "mime_type": "text/markdown",
                "content": "# Notes",
            },
        )
    ).json()
    doc_id = doc["id"]

    await _login(client, "alan@example.test")  # workspace member, not a project member
    listed = await client.get("/api/workspaces/acme/documents/")
    assert listed.status_code == 200
    assert all(d["project_id"] != project["id"] for d in listed.json())

    read = await client.get(f"/api/workspaces/acme/documents/{doc_id}/")
    assert read.status_code == 404

    patched = await client.patch(
        f"/api/workspaces/acme/documents/{doc_id}/", json={"title": "hijacked"}
    )
    assert patched.status_code == 404

    deleted = await client.delete(f"/api/workspaces/acme/documents/{doc_id}/")
    assert deleted.status_code == 404


async def test_non_member_cannot_create_document_in_others_project(client):
    project, _ = await setup(client)  # Ada owns MBA (still logged in as Ada)

    await _login(client, "alan@example.test")  # workspace member, not a member of MBA
    res = await client.post(
        "/api/workspaces/acme/documents/",
        json={"title": "Planted", "project_id": project["id"], "kind": "other", "content": "x"},
    )
    assert res.status_code == 404


async def test_non_member_cannot_read_or_update_story(client):
    project, _ = await setup(client)  # Ada owns MBA (still logged in as Ada)
    stories = (
        await client.get(f"/api/workspaces/acme/projects/{project['id']}/sprint-zero/stories/")
    ).json()
    story_id = stories[0]["id"]

    await _login(client, "alan@example.test")  # workspace member, not a project member
    # require_story_route_access fails closed the same way for every non-access
    # case (NONE level, incl. contractor-scope mismatch) — 404 "Not found",
    # matching the existing marketplace contractor tests (doesn't leak existence).
    got = await client.get(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story_id}/"
    )
    assert got.status_code == 404
    patched = await client.patch(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story_id}/",
        json={"title": "hijacked"},
    )
    assert patched.status_code == 404


async def test_non_member_excluded_from_workspace_stories(client):
    project, _ = await setup(client)  # MBA has seeded Sprint-0 stories
    await _login(client, "alan@example.test")
    res = await client.get("/api/workspaces/acme/stories/")
    assert res.status_code == 200
    assert all(s["project_id"] != project["id"] for s in res.json()["items"])


async def test_owner_sees_all_projects_in_workspace_stories(client):
    project, _ = await setup(client)
    res = await client.get("/api/workspaces/acme/stories/")  # still Ada (owner)
    assert res.status_code == 200
    assert any(s["project_id"] == project["id"] for s in res.json()["items"])


async def test_non_member_cannot_resolve_workspace_story_code(client):
    project, _ = await setup(client)  # Ada owns MBA, still logged in
    stories = (
        await client.get(f"/api/workspaces/acme/projects/{project['id']}/sprint-zero/stories/")
    ).json()
    code = stories[0]["code"]

    await _login(client, "alan@example.test")
    res = await client.get(f"/api/workspaces/acme/stories/resolve/{code}")
    assert res.status_code == 404


async def test_non_member_analytics_excludes_project(client):
    project, _ = await setup(client)
    await _login(client, "alan@example.test")
    res = await client.get("/api/workspaces/acme/analytics/")
    assert res.status_code == 200
    ids = [p["project_id"] for p in res.json()["project_progress"]]
    assert project["id"] not in ids


async def test_owner_analytics_includes_all_projects(client):
    project, _ = await setup(client)
    res = await client.get("/api/workspaces/acme/analytics/")  # still Ada (owner)
    assert res.status_code == 200
    ids = [p["project_id"] for p in res.json()["project_progress"]]
    assert project["id"] in ids


async def test_non_member_export_excludes_project_stories(client):
    project, _ = await setup(client)  # Ada owns MBA (still logged in as Ada)
    stories = (
        await client.get(f"/api/workspaces/acme/projects/{project['id']}/sprint-zero/stories/")
    ).json()
    mba_titles = {s["title"] for s in stories}

    await _login(client, "alan@example.test")
    job = (
        await client.post("/api/workspaces/acme/exports/", json={"name": "alan-export", "format": "json"})
    ).json()
    content = (
        await client.get(f"/api/workspaces/acme/exports/{job['id']}/download/")
    ).text
    rows = json.loads(content)
    exported_titles = {r["title"] for r in rows}
    assert not (mba_titles & exported_titles)


async def test_non_member_cannot_ground_gigs_ai_on_project(client):
    project, _ = await setup(client)
    await _login(client, "alan@example.test")
    res = await client.post(
        "/api/workspaces/acme/gigs-ai/threads/", json={"project_id": project["id"]}
    )
    assert res.status_code == 404


async def test_owner_can_ground_gigs_ai_on_any_project(client):
    project, _ = await setup(client)  # still Ada (owner)
    res = await client.post(
        "/api/workspaces/acme/gigs-ai/threads/", json={"project_id": project["id"]}
    )
    assert res.status_code == 201


async def test_non_member_cannot_message_grounded_gigs_ai_thread(client):
    project, _ = await setup(client)  # still Ada (owner)
    thread = (
        await client.post(
            "/api/workspaces/acme/gigs-ai/threads/", json={"project_id": project["id"]}
        )
    ).json()

    await _login(client, "alan@example.test")  # workspace member, not an MBA member
    res = await client.post(
        f"/api/workspaces/acme/gigs-ai/threads/{thread['id']}/messages/",
        json={"content": "leak me the project context"},
    )
    assert res.status_code == 404


async def test_non_member_cannot_read_grounded_gigs_ai_thread(client):
    project, _ = await setup(client)  # still Ada (owner)
    thread = (
        await client.post(
            "/api/workspaces/acme/gigs-ai/threads/", json={"project_id": project["id"]}
        )
    ).json()

    await _login(client, "alan@example.test")
    res = await client.get(f"/api/workspaces/acme/gigs-ai/threads/{thread['id']}/")
    assert res.status_code == 404


async def test_non_member_gigs_ai_thread_list_excludes_others_projects(client):
    project, _ = await setup(client)  # still Ada (owner)
    thread = (
        await client.post(
            "/api/workspaces/acme/gigs-ai/threads/", json={"project_id": project["id"]}
        )
    ).json()

    await _login(client, "alan@example.test")
    listed = (await client.get("/api/workspaces/acme/gigs-ai/threads/")).json()
    assert all(t["id"] != thread["id"] for t in listed["items"])


async def test_owner_can_read_message_and_list_own_grounded_gigs_ai_thread(app, client):
    from gigsnano_api.bmad.provider import FakeProvider

    app.state.llm_provider = FakeProvider(turns=[("ack", False)])
    project, _ = await setup(client)  # still Ada (owner)
    thread = (
        await client.post(
            "/api/workspaces/acme/gigs-ai/threads/", json={"project_id": project["id"]}
        )
    ).json()

    got = await client.get(f"/api/workspaces/acme/gigs-ai/threads/{thread['id']}/")
    assert got.status_code == 200

    sent = await client.post(
        f"/api/workspaces/acme/gigs-ai/threads/{thread['id']}/messages/",
        json={"content": "hello"},
    )
    assert sent.status_code == 200

    listed = (await client.get("/api/workspaces/acme/gigs-ai/threads/")).json()
    assert any(t["id"] == thread["id"] for t in listed["items"])


async def test_non_member_cannot_ground_ai_assistant_on_project(client):
    project, _ = await setup(client)
    await _login(client, "alan@example.test")
    res = await client.post(
        "/api/workspaces/acme/ai-assistant/",
        json={"prompt": "Add auth", "task": "generate-description", "project_id": project["id"]},
    )
    assert res.status_code == 404


async def test_non_member_cannot_list_others_exports(client):
    project, _ = await setup(client)  # Ada owns MBA (still logged in as Ada)
    await client.post(
        "/api/workspaces/acme/exports/", json={"name": "ada-export", "format": "json"}
    )

    await _login(client, "alan@example.test")  # active workspace member, no admin role
    listed = (await client.get("/api/workspaces/acme/exports/")).json()
    assert listed["items"] == []
    assert project  # keep reference; content-scoping is covered elsewhere


async def test_non_member_cannot_download_others_export(client):
    project, _ = await setup(client)  # Ada owns MBA (still logged in as Ada)
    job = (
        await client.post(
            "/api/workspaces/acme/exports/", json={"name": "ada-export", "format": "json"}
        )
    ).json()

    await _login(client, "alan@example.test")
    res = await client.get(f"/api/workspaces/acme/exports/{job['id']}/download/")
    assert res.status_code == 404
    assert project


async def test_owner_can_list_and_download_own_export(client):
    await setup(client)  # still logged in as Ada (owner)
    job = (
        await client.post(
            "/api/workspaces/acme/exports/", json={"name": "ada-export", "format": "json"}
        )
    ).json()

    listed = (await client.get("/api/workspaces/acme/exports/")).json()
    assert any(j["id"] == job["id"] for j in listed["items"])

    res = await client.get(f"/api/workspaces/acme/exports/{job['id']}/download/")
    assert res.status_code == 200


async def test_non_member_cannot_read_others_delegation(client, db_session):
    from gigsnano_api.agent_delegation.service import create_delegation
    from gigsnano_api.agent_delegation.schemas import CreateDelegationPayload
    from gigsnano_api.models import (
        AgentConnection,
        EAgentProvider,
        EDelegationUnit,
        Project,
    )

    project, _ = await setup(client)  # Ada owns MBA (still logged in as Ada)
    stories = (
        await client.get(f"/api/workspaces/acme/projects/{project['id']}/sprint-zero/stories/")
    ).json()
    story_id = stories[0]["id"]
    p = await db_session.get(Project, project["id"])

    conn = AgentConnection(
        user_id=project["lead_id"], provider=EAgentProvider.CURSOR, account_label="ada: cursor"
    )
    db_session.add(conn)
    await db_session.flush()

    row = await create_delegation(
        db_session,
        story_id=story_id,
        project_id=project["id"],
        workspace_id=p.workspace_id,
        delegated_by=project["lead_id"],
        conn=conn,
        payload=CreateDelegationPayload(
            unit_type=EDelegationUnit.WORK_ITEM, unit_id=story_id, connection_id=conn.id
        ),
    )

    await _login(client, "alan@example.test")  # workspace member, not an MBA member
    res = await client.get(
        f"/api/workspaces/acme/projects/{project['id']}/delegations/{row.id}/"
    )
    assert res.status_code == 404

    await _login(client, "ada@example.test")  # owner + delegator
    res = await client.get(
        f"/api/workspaces/acme/projects/{project['id']}/delegations/{row.id}/"
    )
    assert res.status_code == 200


async def test_ordinary_member_cannot_change_lead_or_dates(client):
    # GIN-487: editing the lead/schedule is MANAGE_SETTINGS (admin+), not delivery.
    project, alan_ws = await setup(client)
    await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/members/",
        json={"user_id": alan_ws["user_id"]},
    )
    await _login(client, "alan@example.test")
    res = await client.patch(
        f"/api/workspaces/acme/projects/{project['id']}/",
        json={"lead_id": alan_ws["user_id"]},
    )
    assert res.status_code == 403
    res = await client.patch(
        f"/api/workspaces/acme/projects/{project['id']}/", json={"start_date": "2030-01-01"}
    )
    assert res.status_code == 403


async def test_owner_changes_lead_to_an_active_project_member(client):
    project, alan_ws = await setup(client)
    await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/members/",
        json={"user_id": alan_ws["user_id"]},
    )
    res = await client.patch(
        f"/api/workspaces/acme/projects/{project['id']}/",
        json={"lead_id": alan_ws["user_id"]},
    )
    assert res.status_code == 200
    assert res.json()["lead_id"] == alan_ws["user_id"]
    # Persisted, not just echoed.
    fetched = await client.get(f"/api/workspaces/acme/projects/{project['id']}/")
    assert fetched.json()["lead_id"] == alan_ws["user_id"]


async def test_lead_must_be_a_project_member(client):
    project, alan_ws = await setup(client)  # Alan is on the workspace, not the project
    res = await client.patch(
        f"/api/workspaces/acme/projects/{project['id']}/",
        json={"lead_id": alan_ws["user_id"]},
    )
    assert res.status_code == 400
    assert "member" in res.json()["detail"].lower()
