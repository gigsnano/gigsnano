from datetime import timedelta

from sqlalchemy import select

from gigsnano_api.bmad.provider import FakeProvider
from gigsnano_api.core.db import utcnow
from gigsnano_api.features.meetings.notes import generate_notes
from gigsnano_api.models import ENotificationKind, Notification, Workspace
from gigsnano_api.models.meetings import (
    ITEM_APPROVED,
    EMeetingPlatform,
    Meeting,
    MeetingActionItem,
    MeetingTranscriptSegment,
)
from gigsnano_api.models.meetings import (
    EMeetingStatus as S,
)

DRAFT = {"summary": "Reviewed checkout.", "action_items": [
    {"title": "Fix payment timeout", "description": "Some cards time out.", "type": "bug",
     "assignee_name": "Ada Lovelace", "due": "tomorrow", "quote": "I'll fix that bug by Friday."},
    {"title": "Saved cards", "type": "feature", "assignee_name": "Nobody Known", "due": None, "quote": ""},
]}


async def _ended(db, project, texts=("hello",)):
    m = Meeting(workspace_id=project.workspace_id, project_id=project.id, title="Checkout sync",
                platform=EMeetingPlatform.ZOOM, meeting_url="u", native_meeting_id="1",
                status=S.ENDED, notes_status="pending", consent_acknowledged_at=utcnow(), ended_at=utcnow())
    db.add(m)
    await db.flush()
    for i, t in enumerate(texts):
        db.add(MeetingTranscriptSegment(meeting_id=m.id, seq=i, speaker="Ada", text=t, start_ms=i, end_ms=i))
    await db.flush()
    return m


async def _project_with_ada(client, db_session):
    """Create a project via the API (Ada Lovelace signs up, owns the workspace and
    the project) so Ada lands as an ACTIVE ProjectMember — make_project alone
    creates no membership row, and the assignee match needs one."""
    from tests.test_meetings import setup_project

    body = await setup_project(client)
    from gigsnano_api.models import Project

    return await db_session.get(Project, body["id"])


async def test_generates_summary_and_items(client, db_session):
    project = await _project_with_ada(client, db_session)
    meeting = await _ended(db_session, project)

    await generate_notes(db_session, meeting, FakeProvider(extractions=[DRAFT]))
    await db_session.commit()
    await db_session.refresh(meeting)

    assert meeting.notes_status == "ready"
    assert meeting.summary == "Reviewed checkout."

    items = (await db_session.execute(
        select(MeetingActionItem).where(MeetingActionItem.meeting_id == meeting.id)
        .order_by(MeetingActionItem.position))).scalars().all()
    assert len(items) == 2
    assert [i.position for i in items] == [0, 1]
    assert [i.status for i in items] == ["pending", "pending"]
    assert items[0].type == "bug" and items[1].type == "feature"
    assert items[0].speaker_name == "Ada Lovelace"
    assert items[1].speaker_name == "Nobody Known"
    assert items[0].assignee_id is not None
    assert items[1].assignee_id is None

    expected_due = (meeting.ended_at.date() + timedelta(days=1))
    assert items[0].target_date == expected_due


async def test_assignee_resolves_to_ada(client, db_session):
    project = await _project_with_ada(client, db_session)
    meeting = await _ended(db_session, project)

    await generate_notes(db_session, meeting, FakeProvider(extractions=[DRAFT]))
    await db_session.commit()

    from gigsnano_api.auth.models import User

    ada = (await db_session.execute(select(User).where(User.email == "ada@example.test"))).scalar_one()
    items = (await db_session.execute(
        select(MeetingActionItem).where(MeetingActionItem.meeting_id == meeting.id)
        .order_by(MeetingActionItem.position))).scalars().all()
    assert items[0].assignee_id == ada.id


async def test_empty_transcript_marks_empty(client, db_session):
    project = await _project_with_ada(client, db_session)
    meeting = await _ended(db_session, project, texts=())

    await generate_notes(db_session, meeting, FakeProvider(extractions=[DRAFT]))
    await db_session.commit()
    await db_session.refresh(meeting)

    assert meeting.notes_status == "empty"
    items = (await db_session.execute(
        select(MeetingActionItem).where(MeetingActionItem.meeting_id == meeting.id))).scalars().all()
    assert items == []


async def test_llm_failure_marks_failed(client, db_session):
    project = await _project_with_ada(client, db_session)
    meeting = await _ended(db_session, project)

    await generate_notes(db_session, meeting, FakeProvider(extractions=[RuntimeError("down")]))
    await db_session.commit()
    await db_session.refresh(meeting)

    assert meeting.notes_status == "failed"


async def test_regenerate_keeps_decided_items(client, db_session):
    project = await _project_with_ada(client, db_session)
    meeting = await _ended(db_session, project)

    await generate_notes(db_session, meeting, FakeProvider(extractions=[DRAFT]))
    await db_session.commit()

    items = (await db_session.execute(
        select(MeetingActionItem).where(MeetingActionItem.meeting_id == meeting.id)
        .order_by(MeetingActionItem.position))).scalars().all()
    approved = items[0]
    approved.status = ITEM_APPROVED
    await db_session.commit()

    second_draft = {"summary": "Follow-up.", "action_items": [
        {"title": "New item", "type": "task", "assignee_name": None, "due": None, "quote": ""},
    ]}
    await generate_notes(db_session, meeting, FakeProvider(extractions=[second_draft]))
    await db_session.commit()

    remaining = (await db_session.execute(
        select(MeetingActionItem).where(MeetingActionItem.meeting_id == meeting.id)
        .order_by(MeetingActionItem.position))).scalars().all()
    assert len(remaining) == 2
    kept = [i for i in remaining if i.id == approved.id]
    assert len(kept) == 1 and kept[0].status == "approved" and kept[0].position == 0
    new_pending = [i for i in remaining if i.id != approved.id][0]
    assert new_pending.status == "pending" and new_pending.position == 2
    assert new_pending.title == "New item"


async def test_creator_gets_review_notification(client, db_session):
    project = await _project_with_ada(client, db_session)
    meeting = await _ended(db_session, project)

    from gigsnano_api.auth.models import User

    ada = (await db_session.execute(select(User).where(User.email == "ada@example.test"))).scalar_one()
    meeting.created_by_id = ada.id
    await db_session.commit()

    await generate_notes(db_session, meeting, FakeProvider(extractions=[DRAFT]))
    await db_session.commit()

    workspace = await db_session.get(Workspace, project.workspace_id)
    notifications = (await db_session.execute(
        select(Notification).where(Notification.receiver_id == ada.id))).scalars().all()
    assert len(notifications) == 1
    notification = notifications[0]
    assert notification.kind == ENotificationKind.REVIEW
    assert notification.title == "Action items ready for review"
    assert "2 action items" in notification.body
    assert notification.href == f"/{workspace.slug}/projects/{project.id}/meetings/{meeting.id}"


async def test_no_notification_when_draft_has_no_action_items(client, db_session):
    project = await _project_with_ada(client, db_session)
    meeting = await _ended(db_session, project)

    from gigsnano_api.auth.models import User

    ada = (await db_session.execute(select(User).where(User.email == "ada@example.test"))).scalar_one()
    meeting.created_by_id = ada.id
    await db_session.commit()

    empty_draft = {"summary": "Nothing actionable.", "action_items": []}
    await generate_notes(db_session, meeting, FakeProvider(extractions=[empty_draft]))
    await db_session.commit()

    notifications = (await db_session.execute(
        select(Notification).where(Notification.receiver_id == ada.id))).scalars().all()
    assert notifications == []


async def test_notes_route_409_until_ended(client):
    from tests.test_meetings import MEET, base, setup_project

    project = await setup_project(client)
    res = await client.post(base(project["id"]), json={"meeting_url": MEET, "consent_acknowledged": True})
    meeting_id = res.json()["id"]
    assert res.json()["status"] in ("joining", "requested")

    notes_res = await client.post(f"{base(project['id'])}{meeting_id}/notes/")
    assert notes_res.status_code == 409
