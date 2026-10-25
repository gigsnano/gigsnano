from datetime import timedelta

from gigsnano_api.bmad.provider import FakeProvider
from gigsnano_api.core.db import utcnow
from gigsnano_api.features.meetings.sync import sweep
from gigsnano_api.meetings.provider import FakeMeetingBotProvider
from gigsnano_api.models.meetings import (
    EMeetingPlatform,
    Meeting,
    MeetingTranscriptSegment,
)
from gigsnano_api.models.meetings import (
    EMeetingStatus as S,
)


async def _meeting(db, project, status=S.JOINING, age=timedelta(0)):
    m = Meeting(workspace_id=project.workspace_id, project_id=project.id, title="t",
                platform=EMeetingPlatform.GOOGLE_MEET, meeting_url="u", native_meeting_id="abc",
                status=status, consent_acknowledged_at=utcnow())
    db.add(m)
    await db.flush()
    m.created_at = utcnow() - age
    await db.commit()
    return m


async def test_sweep_walks_fake_meeting_to_ended(db_session, make_project):
    project = await make_project()
    m = await _meeting(db_session, project)
    fake = FakeMeetingBotProvider(script=[("Ada", "one")])
    await fake.start_bot(platform=m.platform, native_meeting_id="abc", passcode=None, bot_name="x")
    for _ in range(5):
        await sweep(fake, db=db_session)
    await db_session.refresh(m)
    assert m.status is S.ENDED and m.notes_status == "pending"


async def test_sweep_expires_unadmitted_bot(db_session, make_project):
    project = await make_project()
    m = await _meeting(db_session, project, status=S.WAITING_ADMISSION, age=timedelta(minutes=21))
    await sweep(FakeMeetingBotProvider(), db=db_session)
    await db_session.refresh(m)
    assert m.status is S.FAILED and m.failure_reason == "Bot was not admitted"


async def test_one_failing_meeting_does_not_stop_the_sweep(db_session, make_project):
    project = await make_project()
    await _meeting(db_session, project)  # the "abc" meeting whose poll raises
    good = await _meeting(db_session, project)
    good.native_meeting_id = "good"
    await db_session.commit()

    class Flaky(FakeMeetingBotProvider):
        async def get_state(self, *, platform, native_meeting_id):
            if native_meeting_id == "abc":
                raise RuntimeError("boom")
            return await super().get_state(platform=platform, native_meeting_id=native_meeting_id)

    await sweep(Flaky(), db=db_session)
    await db_session.refresh(good)
    assert good.status is S.JOINING  # fake poll 0 → joining; processed despite `bad` failing


async def test_sweep_generates_notes_for_ended_pending_meetings(db_session, make_project):
    project = await make_project()
    m = Meeting(workspace_id=project.workspace_id, project_id=project.id, title="Checkout sync",
               platform=EMeetingPlatform.ZOOM, meeting_url="u", native_meeting_id="1",
               status=S.ENDED, notes_status="pending", consent_acknowledged_at=utcnow(), ended_at=utcnow())
    db_session.add(m)
    await db_session.flush()
    db_session.add(MeetingTranscriptSegment(meeting_id=m.id, seq=0, speaker="Ada", text="hello",
                                            start_ms=0, end_ms=0))
    await db_session.commit()

    draft = {"summary": "Reviewed checkout.", "action_items": [
        {"title": "Follow up", "type": "task", "assignee_name": None, "due": None, "quote": ""},
    ]}
    await sweep(FakeMeetingBotProvider(), FakeProvider(extractions=[draft]), db=db_session)
    await db_session.refresh(m)
    assert m.notes_status == "ready"
    assert m.summary == "Reviewed checkout."


async def test_sweep_marks_notes_failed_on_post_extraction_error_and_does_not_retry_llm(
        db_session, make_project, monkeypatch):
    """Regression: a failure AFTER extraction (rank/resolve_date/notify/DB) used
    to leave notes_status stuck on "pending" forever, so every later sweep tick
    re-called the LLM. It must end up "failed" instead, and a second sweep must
    not call the (single-scripted) LLM again."""
    from gigsnano_api.features.meetings import notes as notes_module

    project = await make_project()
    m = Meeting(workspace_id=project.workspace_id, project_id=project.id, title="Checkout sync",
               platform=EMeetingPlatform.ZOOM, meeting_url="u", native_meeting_id="1",
               status=S.ENDED, notes_status="pending", consent_acknowledged_at=utcnow(), ended_at=utcnow())
    db_session.add(m)
    await db_session.flush()
    db_session.add(MeetingTranscriptSegment(meeting_id=m.id, seq=0, speaker="Ada", text="hello",
                                            start_ms=0, end_ms=0))
    await db_session.commit()

    def _boom(*args, **kwargs):
        raise RuntimeError("resolver boom")

    monkeypatch.setattr(notes_module, "_due", _boom)

    draft = {"summary": "Reviewed checkout.", "action_items": [
        {"title": "Follow up", "type": "task", "assignee_name": None, "due": "Friday", "quote": ""},
    ]}
    # A single scripted extraction: FakeProvider.extract raises AssertionError if
    # called a second time, so this also proves the LLM isn't re-called.
    llm = FakeProvider(extractions=[draft])

    await sweep(FakeMeetingBotProvider(), llm, db=db_session)
    await db_session.refresh(m)
    assert m.notes_status == "failed"

    await sweep(FakeMeetingBotProvider(), llm, db=db_session)
    await db_session.refresh(m)
    assert m.notes_status == "failed"
