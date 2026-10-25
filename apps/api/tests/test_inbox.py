from datetime import timedelta

import httpx
from sqlalchemy import select

from gigsnano_api.core.db import utcnow
from gigsnano_api.models import (
    EActionStatus,
    EDirectorAction,
    EEscalationCategory,
    EEscalationStatus,
    EMemberStatus,
    ENotificationKind,
    EPlanStatus,
    EProjectRole,
    EWorkspaceRole,
    Notification,
    ProjectDirectorAction,
    ProjectEscalation,
    ProjectMember,
    RecoveryPlan,
    WorkspaceMember,
)

OWNER = {"display_name": "Owner", "email": "owner@example.test", "password": "s3cret!"}
MEMBER = {"display_name": "Mia", "email": "mia@example.test", "password": "s3cret!"}
PROJECT = {"name": "Checkout", "identifier": "CHK", "flow": "fresh",
           "cover_image_url": "https://img.test/c.jpg"}


async def _owner_with_project(client) -> tuple[dict, dict]:
    owner = (await client.post("/api/auth/sign-up/", json=OWNER)).json()
    ws = (await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})).json()
    project = (await client.post("/api/workspaces/acme/projects/", json=PROJECT)).json()
    return owner, {"workspace": ws, "project": project}


async def _seed_decisions(db_session, project_id: str, workspace_id: str, receiver_id: str):
    now = utcnow()
    db_session.add_all([
        ProjectDirectorAction(project_id=project_id, action=EDirectorAction.CHANGE_PRIORITY,
                              status=EActionStatus.PENDING, reason="CHK-4 blocks release",
                              created_at=now - timedelta(minutes=4)),
        RecoveryPlan(project_id=project_id, title="Recover the release date",
                     summary="Move two items", status=EPlanStatus.DRAFT,
                     created_at=now - timedelta(minutes=3)),
        ProjectEscalation(project_id=project_id, title="Payment provider blocked",
                          category=EEscalationCategory.VENDOR, status=EEscalationStatus.OPEN,
                          raised_by_name="Sam", created_at=now - timedelta(minutes=2)),
        Notification(receiver_id=receiver_id, workspace_id=workspace_id, project_id=project_id,
                     kind=ENotificationKind.ASSIGNMENT, title="You were assigned CHK-9",
                     body="", read=False, created_at=now - timedelta(minutes=1)),
        Notification(receiver_id=receiver_id, workspace_id=workspace_id, project_id=project_id,
                     kind=ENotificationKind.MENTION, title="Old mention", body="", read=True),
    ])
    await db_session.commit()


async def test_inbox_owner_sees_all_sources(client, db_session):
    owner, ctx = await _owner_with_project(client)
    await _seed_decisions(db_session, ctx["project"]["id"], ctx["workspace"]["id"], owner["id"])

    body = (await client.get("/api/workspaces/acme/inbox/")).json()

    kinds = [i["kind"] for i in body["items"]]
    assert kinds == ["assignment", "escalation", "recovery_plan", "director_action"]  # newest first
    by_kind = {i["kind"]: i for i in body["items"]}
    assert by_kind["director_action"]["actions"] == ["approve", "reject"]
    assert by_kind["director_action"]["title"] == "Change priority"
    assert by_kind["escalation"]["actions"] == ["resolve"]
    assert by_kind["recovery_plan"]["project_name"] == "Checkout"
    assert body["counts"] == {"approvals": 2, "escalations": 1, "assigned": 1, "total": 4}


async def test_inbox_drops_items_decided_elsewhere(client, db_session):
    owner, ctx = await _owner_with_project(client)
    await _seed_decisions(db_session, ctx["project"]["id"], ctx["workspace"]["id"], owner["id"])
    action = (await db_session.execute(select(ProjectDirectorAction))).scalar_one()
    escalation = (await db_session.execute(select(ProjectEscalation))).scalar_one()
    action.status = EActionStatus.APPROVED  # decided on web
    escalation.status = EEscalationStatus.RESOLVED
    await db_session.commit()

    kinds = {i["kind"] for i in (await client.get("/api/workspaces/acme/inbox/")).json()["items"]}
    assert kinds == {"recovery_plan", "assignment"}


async def test_inbox_plain_member_sees_only_their_notifications(app, client, db_session):
    owner, ctx = await _owner_with_project(client)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as member_client:
        member = (await member_client.post("/api/auth/sign-up/", json=MEMBER)).json()
        db_session.add_all([
            WorkspaceMember(workspace_id=ctx["workspace"]["id"], user_id=member["id"],
                            role=EWorkspaceRole.MEMBER, status=EMemberStatus.ACTIVE),
            ProjectMember(project_id=ctx["project"]["id"], user_id=member["id"],
                          role=EProjectRole.MEMBER, status=EMemberStatus.ACTIVE),
        ])
        await db_session.commit()
        await _seed_decisions(db_session, ctx["project"]["id"], ctx["workspace"]["id"],
                              member["id"])

        body = (await member_client.get("/api/workspaces/acme/inbox/")).json()

    assert [i["kind"] for i in body["items"]] == ["assignment"]
    assert body["counts"]["approvals"] == 0


async def test_inbox_requires_membership(app, client):
    await _owner_with_project(client)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as stranger:
        await stranger.post("/api/auth/sign-up/", json=MEMBER)
        res = await stranger.get("/api/workspaces/acme/inbox/")
    assert res.status_code == 403


async def _second_project(client) -> dict:
    return (await client.post("/api/workspaces/acme/projects/", json={
        "name": "Billing", "identifier": "BIL", "flow": "fresh",
        "cover_image_url": "https://img.test/c.jpg"})).json()


async def _join(db_session, ws_id, user_id, ws_role, project_id=None):
    db_session.add(WorkspaceMember(workspace_id=ws_id, user_id=user_id, role=ws_role,
                                   status=EMemberStatus.ACTIVE))
    if project_id:
        db_session.add(ProjectMember(project_id=project_id, user_id=user_id,
                                     role=EProjectRole.MEMBER, status=EMemberStatus.ACTIVE))
    await db_session.commit()


async def test_inbox_admin_without_project_rows_sees_all_projects(app, client, db_session):
    _, ctx = await _owner_with_project(client)
    second = await _second_project(client)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as admin_client:
        admin = (await admin_client.post("/api/auth/sign-up/", json=MEMBER)).json()
        await _join(db_session, ctx["workspace"]["id"], admin["id"], EWorkspaceRole.ADMIN)
        await _seed_decisions(db_session, ctx["project"]["id"], ctx["workspace"]["id"], admin["id"])
        await _seed_decisions(db_session, second["id"], ctx["workspace"]["id"], admin["id"])
        body = (await admin_client.get("/api/workspaces/acme/inbox/")).json()

    projects = {i["project_name"] for i in body["items"] if i["kind"] != "assignment"}
    assert projects == {"Checkout", "Billing"}
    assert body["counts"] == {"approvals": 4, "escalations": 2, "assigned": 2, "total": 8}


async def test_inbox_member_sees_nothing_from_other_project(app, client, db_session):
    _, ctx = await _owner_with_project(client)
    other = await _second_project(client)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as member_client:
        member = (await member_client.post("/api/auth/sign-up/", json=MEMBER)).json()
        await _join(db_session, ctx["workspace"]["id"], member["id"], EWorkspaceRole.MEMBER,
                    ctx["project"]["id"])
        await _seed_decisions(db_session, other["id"], ctx["workspace"]["id"], member["id"])
        body = (await member_client.get("/api/workspaces/acme/inbox/")).json()

    assert body["items"] == []
    assert body["counts"] == {"approvals": 0, "escalations": 0, "assigned": 0, "total": 0}


async def test_inbox_drops_notification_for_project_without_access(app, client, db_session):
    _, ctx = await _owner_with_project(client)
    other = await _second_project(client)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as member_client:
        member = (await member_client.post("/api/auth/sign-up/", json=MEMBER)).json()
        await _join(db_session, ctx["workspace"]["id"], member["id"], EWorkspaceRole.MEMBER,
                    ctx["project"]["id"])
        db_session.add_all([
            Notification(receiver_id=member["id"], workspace_id=ctx["workspace"]["id"],
                         project_id=other["id"], kind=ENotificationKind.ASSIGNMENT,
                         title="Hidden", body="", read=False),
            Notification(receiver_id=member["id"], workspace_id=ctx["workspace"]["id"],
                         project_id=ctx["project"]["id"], kind=ENotificationKind.ASSIGNMENT,
                         title="Visible", body="", read=False),
        ])
        await db_session.commit()
        body = (await member_client.get("/api/workspaces/acme/inbox/")).json()

    assert [i["title"] for i in body["items"]] == ["Visible"]
    assert body["counts"]["assigned"] == 1
