import pytest
from sqlalchemy import select

from gigsnano_api.models import (
    ENotificationKind,
    Notification,
    NotificationTemplate,
    User,
    Workspace,
)


async def setup_ws(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Grace Hopper", "email": "grace@example.test", "password": "s3cret!"})
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})


@pytest.fixture(autouse=True)
async def seed_notification_templates(db_session):
    db_session.add_all(
        [
            NotificationTemplate(
                trigger_key="story.assigned",
                kind=ENotificationKind.ASSIGNMENT,
                label="Story assigned",
                description="When a story assignee is set or changed.",
                title_template="{story}",
                body_template="{actor} assigned you in {project}",
                default_title_template="{story}",
                default_body_template="{actor} assigned you in {project}",
                variables=["actor", "project", "story"],
                enabled=True,
                email_enabled=True,
                email_subject_template="{story}",
                email_body_html_template="<p>{actor} assigned you to {story} in {project}.</p>",
            ),
            NotificationTemplate(
                trigger_key="sprint.zero_complete",
                kind=ENotificationKind.SPRINT,
                label="Sprint-0 complete",
                description="When BMAD Sprint-0 finishes.",
                title_template="Sprint-0 complete",
                body_template="{project} finished BMAD planning",
                default_title_template="Sprint-0 complete",
                default_body_template="{project} finished BMAD planning",
                variables=["project"],
                enabled=True,
            ),
            NotificationTemplate(
                trigger_key="story.created.assigned",
                kind=ENotificationKind.ASSIGNMENT,
                label="Story created with assignee",
                description="Create with assignee.",
                title_template="{story}",
                body_template="{actor} assigned you in {project}",
                default_title_template="{story}",
                default_body_template="{actor} assigned you in {project}",
                variables=["actor", "project", "story"],
                enabled=True,
                email_enabled=True,
                email_subject_template="{story}",
                email_body_html_template="<p>{actor} assigned you to {story} in {project}.</p>",
            ),
            NotificationTemplate(
                trigger_key="story.comment",
                kind=ENotificationKind.SYSTEM,
                label="Story comment",
                description="Comment on watched story.",
                title_template="New comment",
                body_template="{actor} commented on {story}",
                default_title_template="New comment",
                default_body_template="{actor} commented on {story}",
                variables=["actor", "story"],
                enabled=True,
                email_enabled=True,
                email_subject_template="New comment on {story}",
                email_body_html_template="<p>{actor} commented on {story}.</p>",
            ),
            NotificationTemplate(
                trigger_key="story.completed",
                kind=ENotificationKind.SYSTEM,
                label="Story completed",
                description="Story done.",
                title_template="Story completed",
                body_template="{actor} completed {story}",
                default_title_template="Story completed",
                default_body_template="{actor} completed {story}",
                variables=["actor", "story"],
                enabled=True,
            ),
            NotificationTemplate(
                trigger_key="mention.story",
                kind=ENotificationKind.MENTION,
                label="Mentioned in story",
                description="@-mention.",
                title_template="Mentioned you",
                body_template="{actor} mentioned you in {story}",
                default_title_template="Mentioned you",
                default_body_template="{actor} mentioned you in {story}",
                variables=["actor", "story"],
                enabled=True,
            ),
            NotificationTemplate(
                trigger_key="workspace.invite_pending",
                kind=ENotificationKind.SYSTEM,
                label="Workspace invitation",
                description="Pending workspace invite.",
                title_template="Workspace invitation",
                body_template="{actor} invited you to {workspace}",
                default_title_template="Workspace invitation",
                default_body_template="{actor} invited you to {workspace}",
                variables=["actor", "workspace"],
                enabled=True,
            ),
            NotificationTemplate(
                trigger_key="project.member_added",
                kind=ENotificationKind.SYSTEM,
                label="Added to project",
                description="Added to project.",
                title_template="Added to project",
                body_template="{actor} added you to {project}",
                default_title_template="Added to project",
                default_body_template="{actor} added you to {project}",
                variables=["actor", "project"],
                enabled=True,
                email_enabled=True,
                email_subject_template="Added to {project}",
                email_body_html_template="<p>{actor} added you to {project}.</p>",
            ),
            NotificationTemplate(
                trigger_key="sprint.plan_ready",
                kind=ENotificationKind.SPRINT,
                label="Dev sprints ready",
                description="Sprint plan finalized.",
                title_template="Dev sprints ready",
                body_template="{project} dev sprints are ready",
                default_title_template="Dev sprints ready",
                default_body_template="{project} dev sprints are ready",
                variables=["project"],
                enabled=True,
            ),
            NotificationTemplate(
                trigger_key="readiness.concerns",
                kind=ENotificationKind.SYSTEM,
                label="Readiness concerns",
                description="Readiness gate concerns.",
                title_template="Readiness: concerns",
                body_template="{project} readiness gate returned concerns",
                default_title_template="Readiness: concerns",
                default_body_template="{project} readiness gate returned concerns",
                variables=["project"],
                enabled=True,
            ),
            NotificationTemplate(
                trigger_key="readiness.fail",
                kind=ENotificationKind.SYSTEM,
                label="Readiness fail",
                description="Readiness gate fail.",
                title_template="Readiness: fail",
                body_template="{project} readiness gate failed",
                default_title_template="Readiness: fail",
                default_body_template="{project} readiness gate failed",
                variables=["project"],
                enabled=True,
            ),
            NotificationTemplate(
                trigger_key="document.comment.assigned",
                kind=ENotificationKind.ASSIGNMENT,
                label="Document comment assigned",
                description="Doc comment assignee.",
                title_template="{document}",
                body_template="{actor} assigned you a comment on {document}",
                default_title_template="{document}",
                default_body_template="{actor} assigned you a comment on {document}",
                variables=["actor", "document"],
                enabled=True,
            ),
            NotificationTemplate(
                trigger_key="mention.document",
                kind=ENotificationKind.MENTION,
                label="Mentioned in document",
                description="Doc mention.",
                title_template="Mentioned you",
                body_template="{actor} mentioned you in {document}",
                default_title_template="Mentioned you",
                default_body_template="{actor} mentioned you in {document}",
                variables=["actor", "document"],
                enabled=True,
            ),
            NotificationTemplate(
                trigger_key="export.ready",
                kind=ENotificationKind.SYSTEM,
                label="Export ready",
                description="Export done.",
                title_template="Export ready",
                body_template="Your export is ready to download",
                default_title_template="Export ready",
                default_body_template="Your export is ready to download",
                variables=[],
                enabled=True,
                email_enabled=True,
                email_subject_template="Your export is ready",
                email_body_html_template="<p>Your workspace export is ready to download.</p>",
            ),
            NotificationTemplate(
                trigger_key="github.docs_synced",
                kind=ENotificationKind.SYSTEM,
                label="Docs synced",
                description="GitHub sync.",
                title_template="Docs synced",
                body_template="{project} docs synced to GitHub",
                default_title_template="Docs synced",
                default_body_template="{project} docs synced to GitHub",
                variables=["project"],
                enabled=True,
            ),
        ]
    )
    await db_session.commit()


async def _grace_id(db_session) -> str:
    return (
        await db_session.execute(select(User.id).where(User.email == "grace@example.test"))
    ).scalar_one()


async def _seed(db_session, slug="acme"):
    ws = (await db_session.execute(
        select(Workspace).where(Workspace.slug == slug)
    )).scalar_one()
    grace_id = await _grace_id(db_session)
    db_session.add_all([
        Notification(
            workspace_id=ws.id,
            receiver_id=grace_id,
            kind=ENotificationKind.SYSTEM,
            title="Old",
        ),
        Notification(
            workspace_id=ws.id,
            receiver_id=grace_id,
            kind=ENotificationKind.ASSIGNMENT,
            title="New",
        ),
    ])
    await db_session.commit()


async def test_notifications_list_mark(client, db_session):
    await setup_ws(client)
    await _seed(db_session)
    base = "/api/workspaces/acme/notifications/"
    items = (await client.get(base)).json()["items"]
    assert len(items) == 2
    assert set(items[0]) == {"id", "workspace_slug", "kind", "title", "body", "href",
                             "read", "created_at", "actor", "project"}
    assert items[0]["created_at"] >= items[1]["created_at"]

    first = items[0]["id"]
    marked = (await client.patch(f"{base}{first}/", json={"read": True})).json()
    assert marked["read"] is True

    res = await client.post(f"{base}mark-all-read/", json={})
    assert res.status_code == 200 and res.json() == {"success": True}
    assert all(n["read"] for n in (await client.get(base)).json()["items"])


async def test_notifications_category_filter(client, db_session):
    await setup_ws(client)
    ws = (await db_session.execute(select(Workspace).where(Workspace.slug == "acme"))).scalar_one()
    grace_id = await _grace_id(db_session)
    db_session.add_all([
        Notification(workspace_id=ws.id, receiver_id=grace_id, kind=ENotificationKind.MENTION, title="m", read=False),
        Notification(workspace_id=ws.id, receiver_id=grace_id, kind=ENotificationKind.ASSIGNMENT, title="a", read=True),
        Notification(workspace_id=ws.id, receiver_id=grace_id, kind=ENotificationKind.SPRINT, title="s", read=False),
        Notification(workspace_id=ws.id, receiver_id=grace_id, kind=ENotificationKind.SYSTEM, title="y", read=False),
        Notification(workspace_id=ws.id, receiver_id=grace_id, kind=ENotificationKind.REVIEW, title="r", read=False),
        Notification(workspace_id=ws.id, receiver_id=grace_id, kind=ENotificationKind.AGENT, title="g", read=True),
    ])
    await db_session.commit()
    base = "/api/workspaces/acme/notifications/"

    async def kinds(category):
        res = (await client.get(f"{base}?category={category}")).json()
        return sorted(n["kind"] for n in res["items"]), res["total"]

    assert (await kinds("all"))[1] == 6
    assert await kinds("mentions") == (["mention"], 1)
    assert await kinds("assigned") == (["assignment"], 1)
    assert await kinds("unread") == (["mention", "review", "sprint", "system"], 4)
    assert await kinds("reviews") == (["review"], 1)  # GIN-293: readiness gates
    # GIN-293: agent + system + sprint share the Agent & system tab
    assert await kinds("agent_system") == (["agent", "sprint", "system"], 3)


async def test_notifications_populate_actor(client, db_session):
    await setup_ws(client)
    # A second user is the actor (triggered_by); project mirrors the same
    # batch-fetch/serialize path, so actor coverage exercises both.
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Alan Turing", "email": "alan-actor@example.test", "password": "s3cret!"})
    alan = (await client.get("/api/auth/me/")).json()
    await client.post("/api/auth/sign-in/", json={"email": "grace@example.test", "password": "s3cret!"})

    ws = (await db_session.execute(select(Workspace).where(Workspace.slug == "acme"))).scalar_one()
    grace_id = await _grace_id(db_session)
    db_session.add(Notification(
        workspace_id=ws.id, receiver_id=grace_id, triggered_by_id=alan["id"],
        kind=ENotificationKind.MENTION, title="hi",
    ))
    await db_session.commit()

    item = (await client.get("/api/workspaces/acme/notifications/")).json()["items"][0]
    assert item["actor"] == {"id": alan["id"], "display_name": "Alan Turing", "avatar_url": None}
    assert item["project"] is None


async def test_notifications_tenant_scope(client):
    await setup_ws(client)
    await client.post("/api/workspaces/", json={"name": "Beta", "slug": "beta"})
    assert (await client.get("/api/workspaces/beta/notifications/")).json()["items"] == []


async def _project_with_member(client):
    await setup_ws(client)
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Alan Turing", "email": "alan-a@example.test", "password": "s3cret!"})
    alan = (await client.get("/api/auth/me/")).json()
    await client.post("/api/auth/sign-in/", json={"email": "grace@example.test", "password": "s3cret!"})
    await client.post("/api/workspaces/acme/members/", json={"user_id": alan["id"], "role": "member"})
    project = (await client.post("/api/workspaces/acme/projects/", json={
        "name": "App", "identifier": "APP", "flow": "fresh", "cover_image_url": "https://img.test/c.jpg"})).json()
    await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/members/",
        json={"user_id": alan["id"], "role": "member"},
    )
    return project, alan["id"]


async def test_assignment_emits_notification(client):
    project, alan_id = await _project_with_member(client)
    pid = project["id"]
    story = (await client.post(f"/api/workspaces/acme/projects/{pid}/stories/",
                               json={"title": "Do the thing"})).json()
    await client.patch(f"/api/workspaces/acme/projects/{pid}/stories/{story['id']}/",
                       json={"assignee_id": alan_id})
    await client.post("/api/auth/sign-in/", json={"email": "alan-a@example.test", "password": "s3cret!"})
    notes = (await client.get("/api/workspaces/acme/notifications/")).json()["items"]
    assign = [n for n in notes if n["kind"] == "assignment"]
    assert len(assign) == 1
    assert assign[0]["title"] == "Do the thing"
    assert f"/issues/{story['id']}" in assign[0]["href"]


async def test_assignment_sends_email(client):
    from gigsnano_api.email.provider import FakeEmailProvider

    project, alan_id = await _project_with_member(client)
    pid = project["id"]
    story = (await client.post(f"/api/workspaces/acme/projects/{pid}/stories/",
                               json={"title": "Mail me"})).json()
    # Reset AFTER setup: member-add already emailed alan-a. Only the assignment
    # email should be captured here.
    FakeEmailProvider.reset()
    await client.patch(f"/api/workspaces/acme/projects/{pid}/stories/{story['id']}/",
                       json={"assignee_id": alan_id})
    assign = [m for m in FakeEmailProvider.sent if m["to"] == "alan-a@example.test"]
    assert len(assign) == 1, "assigning a story should queue an email to the new assignee"
    assert assign[0]["subject"] == "Mail me"


async def test_create_with_assignee_sends_email(client):
    from gigsnano_api.email.provider import FakeEmailProvider

    project, alan_id = await _project_with_member(client)
    pid = project["id"]
    # Reset AFTER setup so only the create-with-assignee email is captured.
    FakeEmailProvider.reset()
    await client.post(
        f"/api/workspaces/acme/projects/{pid}/stories/",
        json={"title": "Mail on create", "assignee_id": alan_id},
    )
    assign = [m for m in FakeEmailProvider.sent if m["to"] == "alan-a@example.test"]
    assert len(assign) == 1, "creating a story with an assignee should queue an email to them"
    assert assign[0]["subject"] == "Mail on create"


async def test_assignment_only_visible_to_assignee(client):
    project, alan_id = await _project_with_member(client)
    pid = project["id"]
    story = (await client.post(f"/api/workspaces/acme/projects/{pid}/stories/",
                               json={"title": "Private assign"})).json()
    await client.patch(f"/api/workspaces/acme/projects/{pid}/stories/{story['id']}/",
                       json={"assignee_id": alan_id})

    await client.post("/api/auth/sign-in/", json={"email": "alan-a@example.test", "password": "s3cret!"})
    alan_notes = (await client.get("/api/workspaces/acme/notifications/")).json()["items"]
    assert len([n for n in alan_notes if n["kind"] == "assignment"]) == 1

    await client.post("/api/auth/sign-in/", json={"email": "grace@example.test", "password": "s3cret!"})
    grace_notes = (await client.get("/api/workspaces/acme/notifications/")).json()["items"]
    assert len([n for n in grace_notes if n["kind"] == "assignment"]) == 0


async def test_cross_user_mark_read_404(client):
    project, alan_id = await _project_with_member(client)
    pid = project["id"]
    story = (await client.post(f"/api/workspaces/acme/projects/{pid}/stories/",
                               json={"title": "No peek"})).json()
    await client.patch(f"/api/workspaces/acme/projects/{pid}/stories/{story['id']}/",
                       json={"assignee_id": alan_id})
    await client.post("/api/auth/sign-in/", json={"email": "alan-a@example.test", "password": "s3cret!"})
    note_id = (await client.get("/api/workspaces/acme/notifications/")).json()["items"][0]["id"]

    await client.post("/api/auth/sign-in/", json={"email": "grace@example.test", "password": "s3cret!"})
    res = await client.patch(f"/api/workspaces/acme/notifications/{note_id}/", json={"read": True})
    assert res.status_code == 404


async def test_mark_all_read_scoped_to_receiver(client, db_session):
    await setup_ws(client)
    ws = (await db_session.execute(select(Workspace).where(Workspace.slug == "acme"))).scalar_one()
    grace_id = await _grace_id(db_session)

    await client.post("/api/auth/sign-up/", json={
        "display_name": "Alan Turing", "email": "alan-b@example.test", "password": "s3cret!"})
    alan = (await client.get("/api/auth/me/")).json()
    await client.post("/api/auth/sign-in/", json={"email": "grace@example.test", "password": "s3cret!"})
    await client.post("/api/workspaces/acme/members/", json={"user_id": alan["id"], "role": "member"})

    db_session.add_all([
        Notification(workspace_id=ws.id, receiver_id=grace_id, kind=ENotificationKind.SYSTEM, title="G1"),
        Notification(workspace_id=ws.id, receiver_id=alan["id"], kind=ENotificationKind.SYSTEM, title="A1"),
    ])
    await db_session.commit()

    await client.post("/api/workspaces/acme/notifications/mark-all-read/", json={})
    await client.post("/api/auth/sign-in/", json={"email": "alan-b@example.test", "password": "s3cret!"})
    alan_notes = (await client.get("/api/workspaces/acme/notifications/")).json()["items"]
    assert len(alan_notes) == 1 and alan_notes[0]["read"] is False


async def test_unread_counts(client):
    project, alan_id = await _project_with_member(client)
    pid = project["id"]
    story = (await client.post(f"/api/workspaces/acme/projects/{pid}/stories/",
                               json={"title": "Count me"})).json()
    await client.patch(f"/api/workspaces/acme/projects/{pid}/stories/{story['id']}/",
                       json={"assignee_id": alan_id})

    await client.post("/api/auth/sign-in/", json={"email": "alan-a@example.test", "password": "s3cret!"})
    unread = (await client.get("/api/workspaces/acme/notifications/unread/")).json()
    assert unread == {"total_unread": 2, "mention_unread": 0}

    await client.post("/api/auth/sign-in/", json={"email": "grace@example.test", "password": "s3cret!"})
    unread_grace = (await client.get("/api/workspaces/acme/notifications/unread/")).json()
    assert unread_grace == {"total_unread": 0, "mention_unread": 0}


async def test_self_assign_no_notification(client):
    project, _alan_id = await _project_with_member(client)
    pid = project["id"]
    grace = (await client.get("/api/auth/me/")).json()
    story = (await client.post(f"/api/workspaces/acme/projects/{pid}/stories/",
                               json={"title": "Self"})).json()
    await client.patch(f"/api/workspaces/acme/projects/{pid}/stories/{story['id']}/",
                       json={"assignee_id": grace["id"]})
    notes = (await client.get("/api/workspaces/acme/notifications/")).json()["items"]
    assert len([n for n in notes if n["kind"] == "assignment"]) == 0


async def test_sprint_zero_completion_emits_exactly_once(app, client):
    from gigsnano_api.bmad.provider import FakeProvider

    app.state.llm_provider = FakeProvider()
    await setup_ws(client)
    project = (await client.post("/api/workspaces/acme/projects/", json={
        "name": "App", "identifier": "APP", "flow": "fresh",
        "cover_image_url": "https://img.test/c.jpg"})).json()
    pid = project["id"]
    base = f"/api/workspaces/acme/projects/{pid}"

    NON_LLM = {"track-selection", "scope-selection", "cleanup-artifacts"}
    llm_steps_driven = 0
    non_llm_steps_driven = 0
    for _ in range(20):
        stories = (await client.get(f"{base}/stories/")).json()["items"]
        nxt = next((s for s in stories
                    if s.get("bmad") and not s["bmad"]["is_locked"] and s["status"] != "done"), None)
        if nxt is None:
            break
        wf = nxt["bmad"]["workflow"]
        if wf in NON_LLM:
            r = await client.patch(f"{base}/stories/{nxt['id']}/", json={"status": "done"})
            assert r.status_code == 200
            non_llm_steps_driven += 1
        else:
            r = await client.post(f"{base}/stories/{nxt['id']}/thread/", json={})
            assert r.status_code in (200, 201)
            async with client.stream("POST", f"{base}/stories/{nxt['id']}/thread/messages/",
                                     json={"content": "go"}) as resp:
                async for _line in resp.aiter_lines():
                    pass
            r = await client.post(f"{base}/stories/{nxt['id']}/thread/finalize/", json={})
            assert r.status_code == 200
            llm_steps_driven += 1

    assert non_llm_steps_driven == 1
    assert llm_steps_driven == 9

    proj = (await client.get(f"{base}/")).json()
    assert proj["sprint_zero_status"] == "complete"
    sprint = [n for n in (await client.get("/api/workspaces/acme/notifications/")).json()["items"]
              if n["kind"] == "sprint" and n["title"] == "Sprint-0 complete"]
    assert len(sprint) == 1


async def test_sprint_zero_fan_out_per_project_member(client, db_session):
    from gigsnano_api.features.notifications.router import notify_project_members
    from gigsnano_api.models import Project

    project, alan_id = await _project_with_member(client)
    grace_id = await _grace_id(db_session)
    proj = (await db_session.execute(select(Project).where(Project.id == project["id"]))).scalar_one()

    await notify_project_members(
        db_session,
        proj.workspace_id,
        proj.id,
        trigger_key="sprint.zero_complete",
        context={"project": proj.name},
        kind=ENotificationKind.SPRINT,
        href=f"/acme/projects/{proj.id}",
    )
    await db_session.commit()

    rows = (await db_session.execute(select(Notification).where(Notification.kind == ENotificationKind.SPRINT))).scalars().all()
    receiver_ids = {r.receiver_id for r in rows}
    assert receiver_ids == {grace_id, alan_id}


async def test_create_story_with_assignee_notifies_assignee(client):
    project, alan_id = await _project_with_member(client)
    pid = project["id"]
    await client.post(
        f"/api/workspaces/acme/projects/{pid}/stories/",
        json={"title": "New task", "assignee_id": alan_id},
    )
    await client.post("/api/auth/sign-in/", json={"email": "alan-a@example.test", "password": "s3cret!"})
    notes = (await client.get("/api/workspaces/acme/notifications/")).json()["items"]
    created = [n for n in notes if n["title"] == "New task"]
    assert len(created) == 1


async def test_comment_notifies_assignee(client):
    project, alan_id = await _project_with_member(client)
    pid = project["id"]
    story = (await client.post(
        f"/api/workspaces/acme/projects/{pid}/stories/",
        json={"title": "Discuss me", "assignee_id": alan_id},
    )).json()
    await client.post(
        f"/api/workspaces/acme/projects/{pid}/stories/{story['id']}/comments/",
        json={"body": "What do you think?"},
    )
    await client.post("/api/auth/sign-in/", json={"email": "alan-a@example.test", "password": "s3cret!"})
    notes = (await client.get("/api/workspaces/acme/notifications/")).json()["items"]
    comments = [n for n in notes if "commented on" in n["body"]]
    assert len(comments) == 1


async def test_comment_sends_email_to_assignee(client):
    from gigsnano_api.email.provider import FakeEmailProvider

    project, alan_id = await _project_with_member(client)
    pid = project["id"]
    story = (await client.post(
        f"/api/workspaces/acme/projects/{pid}/stories/",
        json={"title": "Discuss me", "assignee_id": alan_id},
    )).json()
    FakeEmailProvider.reset()
    await client.post(
        f"/api/workspaces/acme/projects/{pid}/stories/{story['id']}/comments/",
        json={"body": "What do you think?"},
    )
    assert any(
        m["to"] == "alan-a@example.test" and "comment" in m["subject"].lower()
        for m in FakeEmailProvider.sent
    ), "commenting on a watched story should email the assignee"


async def test_project_member_add_sends_email(client):
    from gigsnano_api.email.provider import FakeEmailProvider

    await client.post("/api/auth/sign-up/", json={
        "display_name": "Alan Turing", "email": "alan-pm@example.test", "password": "s3cret!"})
    alan = (await client.get("/api/auth/me/")).json()
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada-pm@example.test", "password": "s3cret!"})
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    await client.post("/api/workspaces/acme/members/", json={"user_id": alan["id"]})
    project = (await client.post("/api/workspaces/acme/projects/", json={
        "name": "App", "identifier": "APP", "flow": "fresh",
        "cover_image_url": "https://img.test/c.jpg"})).json()
    # Reset after workspace-member-add so only the project-member-add email counts.
    FakeEmailProvider.reset()
    await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/members/",
        json={"user_id": alan["id"]},
    )
    assert any(
        m["to"] == "alan-pm@example.test" for m in FakeEmailProvider.sent
    ), "adding a user to a project should email them"


async def test_complete_notifies_assignee(client):
    project, alan_id = await _project_with_member(client)
    pid = project["id"]
    story = (await client.post(
        f"/api/workspaces/acme/projects/{pid}/stories/",
        json={"title": "Finish me", "assignee_id": alan_id},
    )).json()
    await client.patch(
        f"/api/workspaces/acme/projects/{pid}/stories/{story['id']}/",
        json={"status": "done"},
    )
    await client.post("/api/auth/sign-in/", json={"email": "alan-a@example.test", "password": "s3cret!"})
    notes = (await client.get("/api/workspaces/acme/notifications/")).json()["items"]
    completed = [n for n in notes if "completed" in n["body"]]
    assert len(completed) == 1


async def test_mention_in_comment_notifies_user(client):
    project, alan_id = await _project_with_member(client)
    pid = project["id"]
    story = (await client.post(f"/api/workspaces/acme/projects/{pid}/stories/", json={"title": "Ping"})).json()
    await client.post(
        f"/api/workspaces/acme/projects/{pid}/stories/{story['id']}/comments/",
        json={"body": "Hey @Alan Turing — please review"},
    )
    await client.post("/api/auth/sign-in/", json={"email": "alan-a@example.test", "password": "s3cret!"})
    notes = (await client.get("/api/workspaces/acme/notifications/")).json()["items"]
    mentions = [n for n in notes if n["kind"] == "mention"]
    assert len(mentions) == 1


async def test_pending_workspace_invite_notifies_invitee(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Alan Turing", "email": "alan@example.test", "password": "s3cret!",
    })
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    res = await client.post(
        "/api/workspaces/acme/members/", json={"email": "alan@example.test"}
    )
    assert res.status_code == 201
    assert res.json()["status"] == "pending"

    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-in/", json={
        "email": "alan@example.test", "password": "s3cret!",
    })
    notes = (await client.get("/api/workspaces/acme/notifications/")).json()["items"]
    invites = [n for n in notes if "invited you to" in n["body"]]
    assert len(invites) == 1
    assert invites[0]["title"] == "Workspace invitation"
    assert invites[0]["href"] == "/acme"


async def test_active_workspace_add_does_not_emit_pending_invite(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Alan Turing", "email": "alan@example.test", "password": "s3cret!",
    })
    alan = (await client.get("/api/auth/me/")).json()
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    await client.post("/api/workspaces/acme/members/", json={"user_id": alan["id"]})

    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-in/", json={
        "email": "alan@example.test", "password": "s3cret!",
    })
    notes = (await client.get("/api/workspaces/acme/notifications/")).json()["items"]
    assert notes == []


async def test_project_member_add_notifies_new_member(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Alan Turing", "email": "alan@example.test", "password": "s3cret!",
    })
    alan = (await client.get("/api/auth/me/")).json()
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    await client.post("/api/workspaces/acme/members/", json={"user_id": alan["id"]})
    project = (await client.post("/api/workspaces/acme/projects/", json={
        "name": "Mobile App", "identifier": "MBA", "flow": "fresh",
        "cover_image_url": "https://img.test/c.jpg",
    })).json()

    await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/members/",
        json={"user_id": alan["id"]},
    )

    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-in/", json={
        "email": "alan@example.test", "password": "s3cret!",
    })
    notes = (await client.get("/api/workspaces/acme/notifications/")).json()["items"]
    added = [n for n in notes if "added you to" in n["body"]]
    assert len(added) == 1
    assert added[0]["title"] == "Added to project"
    assert added[0]["href"] == f"/acme/projects/{project['id']}"


def _by_workflow(stories, workflow):
    return next(s for s in stories if s.get("bmad") and s["bmad"]["workflow"] == workflow)


async def _sprint_zero(client, project_id):
    return (
        await client.get(f"/api/workspaces/acme/projects/{project_id}/sprint-zero/stories/")
    ).json()


async def _walk_to_readiness_gate(client, project_id):
    stories = await _sprint_zero(client, project_id)
    for workflow in (
        "track-selection",
        "bmad-prd",
        "bmad-create-architecture",
        "bmad-create-epics-and-stories",
    ):
        story = _by_workflow(stories, workflow)
        await client.patch(
            f"/api/workspaces/acme/projects/{project_id}/stories/{story['id']}/",
            json={"status": "done"},
        )
        stories = await _sprint_zero(client, project_id)
    return _by_workflow(stories, "bmad-check-implementation-readiness")


async def test_readiness_concerns_notifies_workspace_admin(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Alan Turing", "email": "alan-admin@example.test", "password": "s3cret!",
    })
    alan = (await client.get("/api/auth/me/")).json()
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    await client.post(
        "/api/workspaces/acme/members/",
        json={"user_id": alan["id"], "role": "admin"},
    )
    project = (await client.post("/api/workspaces/acme/projects/", json={
        "name": "App", "identifier": "APP", "flow": "fresh", "has_ui": False,
        "cover_image_url": "https://img.test/c.jpg",
    })).json()

    gate = await _walk_to_readiness_gate(client, project["id"])
    res = await client.patch(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{gate['id']}/",
        json={"status": "done", "readiness_result": "concerns"},
    )
    assert res.status_code == 200

    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-in/", json={
        "email": "alan-admin@example.test", "password": "s3cret!",
    })
    notes = (await client.get("/api/workspaces/acme/notifications/")).json()["items"]
    concerns = [n for n in notes if "readiness gate returned concerns" in n["body"]]
    assert len(concerns) == 1


async def test_readiness_pass_does_not_notify(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    project = (await client.post("/api/workspaces/acme/projects/", json={
        "name": "App", "identifier": "APP", "flow": "fresh", "has_ui": False,
        "cover_image_url": "https://img.test/c.jpg",
    })).json()

    gate = await _walk_to_readiness_gate(client, project["id"])
    await client.patch(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{gate['id']}/",
        json={"readiness_result": "pass"},
    )
    notes = (await client.get("/api/workspaces/acme/notifications/")).json()["items"]
    assert not any("readiness gate" in n["body"] for n in notes)


async def test_readiness_same_value_does_not_duplicate(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Alan Turing", "email": "alan-dup@example.test", "password": "s3cret!",
    })
    alan = (await client.get("/api/auth/me/")).json()
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    await client.post("/api/workspaces/acme/members/", json={"user_id": alan["id"], "role": "admin"})
    project = (await client.post("/api/workspaces/acme/projects/", json={
        "name": "App", "identifier": "APP", "flow": "fresh", "has_ui": False,
        "cover_image_url": "https://img.test/c.jpg",
    })).json()

    gate = await _walk_to_readiness_gate(client, project["id"])
    base = f"/api/workspaces/acme/projects/{project['id']}/stories/{gate['id']}/"
    await client.patch(base, json={"status": "done", "readiness_result": "concerns"})
    await client.patch(base, json={"readiness_result": "concerns"})

    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-in/", json={
        "email": "alan-dup@example.test", "password": "s3cret!",
    })
    notes = (await client.get("/api/workspaces/acme/notifications/")).json()["items"]
    concerns = [n for n in notes if "readiness gate returned concerns" in n["body"]]
    assert len(concerns) == 1


async def test_sprint_plan_finalize_notifies_project_members(app, client):
    from gigsnano_api.bmad.provider import FakeProvider

    verdict = {"verdict": "pass", "concerns": [], "markdown": "# Report"}
    epics_payload = {"title": "E", "markdown": "# E", "epics": [
        {"title": "Core", "description": "", "stories": [
            {"title": "S1", "description": "", "priority": "none"}]}]}
    app.state.llm_provider = FakeProvider(
        extractions=[
            {"title": "PRD", "markdown": "# PRD"},
            {"title": "Arch", "markdown": "# Arch"},
            epics_payload,
            verdict,
        ]
    )
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    project = (await client.post("/api/workspaces/acme/projects/", json={
        "name": "App", "identifier": "APP", "flow": "fresh", "has_ui": False,
        "cover_image_url": "https://img.test/c.jpg",
    })).json()
    pid = project["id"]

    stories = await _sprint_zero(client, pid)
    await client.patch(
        f"/api/workspaces/acme/projects/{pid}/stories/"
        f"{_by_workflow(stories, 'track-selection')['id']}/",
        json={"status": "done"},
    )
    for workflow in (
        "bmad-prd",
        "bmad-create-architecture",
        "bmad-create-epics-and-stories",
        "bmad-check-implementation-readiness",
    ):
        story = _by_workflow(await _sprint_zero(client, pid), workflow)
        base = f"/api/workspaces/acme/projects/{pid}/stories/{story['id']}"
        await client.post(f"{base}/thread/")
        await client.post(f"{base}/thread/finalize/")

    product_id = next(
        s["id"]
        for s in (await client.get(f"/api/workspaces/acme/projects/{pid}/stories/")).json()["items"]
        if s["bmad"] is None and s["type"] == "story"
    )
    app.state.llm_provider = FakeProvider(extractions=[{
        "title": "Sprint Plan", "markdown": "# Plan",
        "sprints": [{"name": "Sprint 1", "story_ids": [product_id]}],
    }])
    planning = _by_workflow(await _sprint_zero(client, pid), "bmad-sprint-planning")
    base = f"/api/workspaces/acme/projects/{pid}/stories/{planning['id']}"
    await client.post(f"{base}/thread/")
    await client.post(f"{base}/thread/finalize/")

    notes = (await client.get("/api/workspaces/acme/notifications/")).json()["items"]
    plan_notes = [n for n in notes if n["kind"] == "sprint" and "dev sprints are ready" in n["body"]]
    assert len(plan_notes) == 1
    assert plan_notes[0]["href"] == f"/acme/projects/{pid}/cycles"


async def test_export_ready_notifies_requester(client):
    await setup_ws(client)
    res = await client.post(
        "/api/workspaces/acme/exports/", json={"name": "Stories", "format": "csv"}
    )
    assert res.status_code == 201
    notes = (await client.get("/api/workspaces/acme/notifications/")).json()["items"]
    ready = [n for n in notes if "ready to download" in n["body"]]
    assert len(ready) == 1
    assert ready[0]["href"].endswith("/download/")


async def test_export_ready_sends_email(client):
    from gigsnano_api.email.provider import FakeEmailProvider

    await setup_ws(client)
    FakeEmailProvider.reset()
    res = await client.post(
        "/api/workspaces/acme/exports/", json={"name": "Stories", "format": "csv"}
    )
    assert res.status_code == 201
    assert any(
        m["to"] == "grace@example.test" and "export" in m["subject"].lower()
        for m in FakeEmailProvider.sent
    ), "a ready export should email the requester (built provider in the bg task)"


async def test_document_comment_assignee_notifies(app, client):
    from gigsnano_api.bmad.provider import FakeProvider

    app.state.llm_provider = FakeProvider(
        extractions=[{"title": "PRD", "markdown": "# PRD\n\nBody"}]
    )
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Alan Turing", "email": "alan-doc@example.test", "password": "s3cret!",
    })
    alan = (await client.get("/api/auth/me/")).json()
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    await client.post("/api/workspaces/acme/members/", json={"user_id": alan["id"]})
    project = (await client.post("/api/workspaces/acme/projects/", json={
        "name": "App", "identifier": "APP", "flow": "fresh", "has_ui": False,
        "cover_image_url": "https://img.test/c.jpg",
    })).json()
    await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/members/",
        json={"user_id": alan["id"]},
    )
    stories = (
        await client.get(f"/api/workspaces/acme/projects/{project['id']}/sprint-zero/stories/")
    ).json()
    track = _by_workflow(stories, "track-selection")
    await client.patch(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{track['id']}/",
        json={"status": "done"},
    )
    prd = _by_workflow(stories, "bmad-prd")
    base = f"/api/workspaces/acme/projects/{project['id']}/stories/{prd['id']}"
    await client.post(f"{base}/thread/")
    doc = (await client.post(f"{base}/thread/finalize/")).json()["document"]

    await client.post(
        f"/api/workspaces/acme/documents/{doc['id']}/comments/",
        json={
            "block_index": 0,
            "body": "Please review this section",
            "assignee_user_id": alan["id"],
        },
    )

    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-in/", json={
        "email": "alan-doc@example.test", "password": "s3cret!",
    })
    notes = (await client.get("/api/workspaces/acme/notifications/")).json()["items"]
    assigned = [n for n in notes if n["kind"] == "assignment" and "comment" in n["body"]]
    assert len(assigned) == 1


async def test_document_comment_mention_notifies(app, client):
    from gigsnano_api.bmad.provider import FakeProvider

    app.state.llm_provider = FakeProvider(
        extractions=[{"title": "PRD", "markdown": "# PRD\n\nBody"}]
    )
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Alan Turing", "email": "alan-mention@example.test", "password": "s3cret!",
    })
    alan = (await client.get("/api/auth/me/")).json()
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    await client.post("/api/workspaces/acme/members/", json={"user_id": alan["id"]})
    project = (await client.post("/api/workspaces/acme/projects/", json={
        "name": "App", "identifier": "APP", "flow": "fresh", "has_ui": False,
        "cover_image_url": "https://img.test/c.jpg",
    })).json()
    await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/members/",
        json={"user_id": alan["id"]},
    )
    stories = (
        await client.get(f"/api/workspaces/acme/projects/{project['id']}/sprint-zero/stories/")
    ).json()
    track = _by_workflow(stories, "track-selection")
    await client.patch(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{track['id']}/",
        json={"status": "done"},
    )
    prd = _by_workflow(stories, "bmad-prd")
    base = f"/api/workspaces/acme/projects/{project['id']}/stories/{prd['id']}"
    await client.post(f"{base}/thread/")
    doc = (await client.post(f"{base}/thread/finalize/")).json()["document"]

    await client.post(
        f"/api/workspaces/acme/documents/{doc['id']}/comments/",
        json={"block_index": 0, "body": "Hey @Alan Turing — thoughts?"},
    )

    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-in/", json={
        "email": "alan-mention@example.test", "password": "s3cret!",
    })
    notes = (await client.get("/api/workspaces/acme/notifications/")).json()["items"]
    mentions = [n for n in notes if n["kind"] == "mention"]
    assert len(mentions) == 1
