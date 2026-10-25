"""Meeting notes, document-package analysis and voice turns call the LLM; each must
record its usage (and so debit the wallet on the hosted service) like every other
AI feature. See test_llm_debit_coverage.LLM_CALL_SITES."""
from sqlalchemy import select

from gigsnano_api.auth.models import User
from gigsnano_api.bmad.provider import FakeProvider
from gigsnano_api.core.db import utcnow
from gigsnano_api.features.meetings.notes import generate_notes
from gigsnano_api.llm.usage import UsageTally
from gigsnano_api.models import ELlmUsageSource, LlmUsageEvent, Project
from gigsnano_api.models.meetings import EMeetingPlatform, Meeting, MeetingTranscriptSegment
from gigsnano_api.models.meetings import EMeetingStatus as S

NOTES = {"summary": "Reviewed checkout.", "action_items": []}


async def _events(db, source):
    rows = await db.execute(select(LlmUsageEvent).where(LlmUsageEvent.source == source))
    return list(rows.scalars())


def test_tally_sums_calls():
    class _R:
        def __init__(self, i, o):
            self.input_tokens, self.output_tokens = i, o

    t = UsageTally()
    t.add(_R(10, 20))
    t.add(_R(None, 5))
    assert (t.calls, t.input_tokens, t.output_tokens) == (2, 10, 25)


async def _meeting(db, project, created_by_id):
    m = Meeting(workspace_id=project.workspace_id, project_id=project.id, title="Sync",
                platform=EMeetingPlatform.ZOOM, meeting_url="u", native_meeting_id="1",
                status=S.ENDED, notes_status="pending", consent_acknowledged_at=utcnow(),
                ended_at=utcnow(), created_by_id=created_by_id)
    db.add(m)
    await db.flush()
    db.add(MeetingTranscriptSegment(meeting_id=m.id, seq=0, speaker="Ada", text="hi", start_ms=0, end_ms=1))
    await db.flush()
    return m


async def test_meeting_notes_record_usage_against_the_meeting_creator(client, db_session):
    from tests.test_meetings import setup_project

    project = await db_session.get(Project, (await setup_project(client))["id"])
    ada = (await db_session.execute(select(User).where(User.email == "ada@example.test"))).scalar_one()
    meeting = await _meeting(db_session, project, ada.id)

    await generate_notes(db_session, meeting, FakeProvider(extractions=[NOTES]))

    [event] = await _events(db_session, ELlmUsageSource.MEETING_NOTES)
    assert event.workspace_id == project.workspace_id
    assert event.user_id == ada.id
    assert event.project_id == project.id


async def test_meeting_without_a_creator_still_gets_notes(client, db_session):
    from tests.test_meetings import setup_project

    project = await db_session.get(Project, (await setup_project(client))["id"])
    meeting = await _meeting(db_session, project, None)

    await generate_notes(db_session, meeting, FakeProvider(extractions=[NOTES]))

    assert meeting.notes_status != "failed"
    assert await _events(db_session, ELlmUsageSource.MEETING_NOTES) == []


async def test_package_analysis_records_usage(app, client, db_session):
    from tests.test_package_import_api import _SPEC_FILE, _project, _signup_ws, _upload

    await _signup_ws(client)
    pid = await _project(client)
    package = await _upload(client, pid, [_SPEC_FILE])
    app.state.llm_provider = FakeProvider(extractions=[{"findings": []}, {"findings": []}])

    r = await client.post(f"/api/workspaces/acme/projects/{pid}/packages/{package['id']}/analyse/")

    assert r.status_code == 200, r.text
    [event] = await _events(db_session, ELlmUsageSource.PACKAGE_IMPORT)
    assert event.project_id == pid
    assert event.input_tokens > 0


async def test_voice_turn_records_usage(client, db_session):
    from tests.test_voice_turn import setup, turn

    session_id, agent_id = await setup(client)
    await turn(client, session_id, agent_id, "What is on my plate?")

    events = await _events(db_session, ELlmUsageSource.VOICE)
    assert len(events) == 1
