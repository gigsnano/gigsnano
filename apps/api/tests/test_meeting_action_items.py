from gigsnano_api.core.db import utcnow
from gigsnano_api.models import Project
from gigsnano_api.models.meetings import (
    ITEM_APPROVED,
    ITEM_DISMISSED,
    ITEM_PENDING,
    EMeetingPlatform,
    Meeting,
    MeetingActionItem,
)
from gigsnano_api.models.meetings import (
    EMeetingStatus as S,
)
from tests.test_meetings import _login, base, setup, setup_project
from tests.test_project_viewer_readonly import setup_project_with_alan


def items_base(pid, mid):
    return f"{base(pid)}{mid}/action-items/"


async def _project_with_ada(client, db_session):
    """Ada signs up + owns workspace acme + project MBA (ACTIVE ProjectMember)."""
    body = await setup_project(client)
    project = await db_session.get(Project, body["id"])
    return project, body


async def _ended_meeting(db, project, *, title="Standup"):
    m = Meeting(workspace_id=project.workspace_id, project_id=project.id, title=title,
                platform=EMeetingPlatform.ZOOM, meeting_url="u", native_meeting_id="1",
                status=S.ENDED, notes_status="ready", consent_acknowledged_at=utcnow(), ended_at=utcnow())
    db.add(m)
    await db.flush()
    return m


async def _item(db, meeting, project, *, position, status=ITEM_PENDING, type_="task", title="Item",
                assignee_id=None, target_date=None, quote="", description=""):
    item = MeetingActionItem(meeting_id=meeting.id, project_id=project.id, status=status, type=type_,
                             title=title, description=description, quote=quote, assignee_id=assignee_id,
                             target_date=target_date, position=position)
    db.add(item)
    await db.flush()
    return item


async def test_list_orders_by_position(client, db_session):
    project, body = await _project_with_ada(client, db_session)
    meeting = await _ended_meeting(db_session, project)
    await _item(db_session, meeting, project, position=2, title="Third")
    await _item(db_session, meeting, project, position=0, title="First")
    await _item(db_session, meeting, project, position=1, title="Second")
    await db_session.commit()

    res = await client.get(items_base(body["id"], meeting.id))
    assert res.status_code == 200
    assert [i["title"] for i in res.json()] == ["First", "Second", "Third"]


async def test_patch_updates_fields(client, db_session):
    project, body = await _project_with_ada(client, db_session)
    meeting = await _ended_meeting(db_session, project)
    item = await _item(db_session, meeting, project, position=0)
    await db_session.commit()

    res = await client.patch(f"{items_base(body['id'], meeting.id)}{item.id}/", json={
        "title": "New title", "type": "bug", "target_date": "2026-09-26",
    })
    assert res.status_code == 200, res.text
    payload = res.json()
    assert payload["title"] == "New title"
    assert payload["type"] == "bug"
    assert payload["target_date"] == "2026-09-26"


async def test_patch_explicit_null_title_422(client, db_session):
    """title is a NOT NULL column — an explicit `null` must 422, not 500."""
    project, body = await _project_with_ada(client, db_session)
    meeting = await _ended_meeting(db_session, project)
    item = await _item(db_session, meeting, project, position=0)
    await db_session.commit()

    res = await client.patch(f"{items_base(body['id'], meeting.id)}{item.id}/", json={"title": None})
    assert res.status_code == 422


async def test_patch_assignee_not_member_422(client, db_session):
    project, body = await _project_with_ada(client, db_session)
    meeting = await _ended_meeting(db_session, project)
    item = await _item(db_session, meeting, project, position=0)
    await db_session.commit()

    res = await client.patch(f"{items_base(body['id'], meeting.id)}{item.id}/", json={
        "assignee_id": "nonexistent-user-id",
    })
    assert res.status_code == 422


async def test_patch_approved_item_409(client, db_session):
    project, body = await _project_with_ada(client, db_session)
    meeting = await _ended_meeting(db_session, project)
    item = await _item(db_session, meeting, project, position=0, status=ITEM_APPROVED)
    await db_session.commit()

    res = await client.patch(f"{items_base(body['id'], meeting.id)}{item.id}/", json={"title": "x"})
    assert res.status_code == 409


async def test_approve_creates_story_and_second_approve_409s(client, db_session):
    project, body = await _project_with_ada(client, db_session)
    meeting = await _ended_meeting(db_session, project, title="Checkout sync")
    item = await _item(db_session, meeting, project, position=0, type_="feature", title="Saved cards",
                       description="Let shoppers save a card.",
                       quote='We should let them save a card, "please".')
    await db_session.commit()

    res = await client.post(f"{items_base(body['id'], meeting.id)}{item.id}/approve/")
    assert res.status_code == 200, res.text
    payload = res.json()
    assert payload["status"] == "approved"
    assert payload["created_story_id"]

    story_res = await client.get(
        f"/api/workspaces/acme/projects/{body['id']}/stories/{payload['created_story_id']}/")
    assert story_res.status_code == 200, story_res.text
    story = story_res.json()
    assert story["type"] == "feature"
    assert story["title"] == "Saved cards"
    assert "<blockquote>" in story["description"]
    assert "&quot;please&quot;" in story["description"]

    second = await client.post(f"{items_base(body['id'], meeting.id)}{item.id}/approve/")
    assert second.status_code == 409


async def test_dismiss_then_409(client, db_session):
    project, body = await _project_with_ada(client, db_session)
    meeting = await _ended_meeting(db_session, project)
    item = await _item(db_session, meeting, project, position=0)
    await db_session.commit()

    res = await client.post(f"{items_base(body['id'], meeting.id)}{item.id}/dismiss/")
    assert res.status_code == 200
    assert res.json()["status"] == "dismissed"

    second = await client.post(f"{items_base(body['id'], meeting.id)}{item.id}/dismiss/")
    assert second.status_code == 409


async def test_bulk_approve_skips_non_pending(client, db_session):
    project, body = await _project_with_ada(client, db_session)
    meeting = await _ended_meeting(db_session, project)
    a = await _item(db_session, meeting, project, position=0, title="A", type_="task")
    b = await _item(db_session, meeting, project, position=1, title="B", type_="task")
    dismissed = await _item(db_session, meeting, project, position=2, title="C", status=ITEM_DISMISSED)
    await db_session.commit()

    res = await client.post(f"{items_base(body['id'], meeting.id)}approve/", json={
        "ids": [a.id, b.id, dismissed.id],
    })
    assert res.status_code == 200, res.text
    payload = res.json()
    assert len(payload) == 3
    by_id = {p["id"]: p for p in payload}
    assert by_id[a.id]["status"] == "approved" and by_id[a.id]["created_story_id"]
    assert by_id[b.id]["status"] == "approved" and by_id[b.id]["created_story_id"]
    assert by_id[dismissed.id]["status"] == "dismissed" and by_id[dismissed.id]["created_story_id"] is None


async def test_non_member_404_on_list(client, db_session):
    body, _alan_ws = await setup(client)
    project = await db_session.get(Project, body["id"])
    meeting = await _ended_meeting(db_session, project)
    await db_session.commit()

    await _login(client, "alan@example.test")
    res = await client.get(items_base(body["id"], meeting.id))
    assert res.status_code == 404


async def test_viewer_403_on_approve(client, db_session):
    body = await setup_project_with_alan(client, "viewer")
    project = await db_session.get(Project, body["id"])
    meeting = await _ended_meeting(db_session, project)
    item = await _item(db_session, meeting, project, position=0)
    await db_session.commit()

    await _login(client, "alan@example.test")
    res = await client.post(f"{items_base(body['id'], meeting.id)}{item.id}/approve/")
    assert res.status_code == 403


async def test_pending_action_items_count_reflects_remaining(client, db_session):
    project, body = await _project_with_ada(client, db_session)
    meeting = await _ended_meeting(db_session, project)
    a = await _item(db_session, meeting, project, position=0)
    await _item(db_session, meeting, project, position=1)
    await db_session.commit()

    before = await client.get(f"{base(body['id'])}{meeting.id}/")
    assert before.json()["pending_action_items"] == 2

    approve = await client.post(f"{items_base(body['id'], meeting.id)}{a.id}/approve/")
    assert approve.status_code == 200, approve.text

    after = await client.get(f"{base(body['id'])}{meeting.id}/")
    assert after.json()["pending_action_items"] == 1
