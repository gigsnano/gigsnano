from gigsnano_api.meetings.provider import BotSegment, BotState, MeetingBotError
from gigsnano_api.models.meetings import EMeetingStatus as S

MEET = "https://meet.google.com/abc-defg-hij"


def base(pid):
    return f"/api/workspaces/acme/projects/{pid}/meetings/"


async def setup_project(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    return (
        await client.post("/api/workspaces/acme/projects/", json={
            "name": "Mobile App", "identifier": "MBA", "flow": "fresh",
            "cover_image_url": "https://img.test/c.jpg",
        })
    ).json()


async def setup(client):
    """Ada owns workspace acme + project MBA; Alan is an ACTIVE workspace member (no project membership)."""
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Alan Turing", "email": "alan@example.test", "password": "s3cret!",
    })
    await client.post("/api/auth/sign-out/")
    project = await setup_project(client)
    alan_ws = (
        await client.post("/api/workspaces/acme/members/", json={"email": "alan@example.test"})
    ).json()
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-in/", json={"email": "alan@example.test", "password": "s3cret!"})
    await client.patch(f"/api/workspaces/acme/members/{alan_ws['id']}/", json={"accept": True})
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-in/", json={"email": "ada@example.test", "password": "s3cret!"})
    return project, alan_ws


async def _login(client, email):
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-in/", json={"email": email, "password": "s3cret!"})


async def test_create_meeting_starts_bot(client):
    project = await setup_project(client)
    res = await client.post(base(project["id"]), json={"meeting_url": MEET, "consent_acknowledged": True})
    assert res.status_code == 201
    body = res.json()
    assert body["platform"] == "google_meet" and body["status"] == "joining"
    assert body["title"] == "Google Meet meeting"
    listed = (await client.get(base(project["id"]))).json()
    assert [m["id"] for m in listed] == [body["id"]]


async def test_create_rejects_bad_link_and_missing_consent(client):
    project = await setup_project(client)
    bad = await client.post(base(project["id"]), json={"meeting_url": "https://x.test/a", "consent_acknowledged": True})
    assert bad.status_code == 422
    no_consent = await client.post(base(project["id"]), json={"meeting_url": MEET, "consent_acknowledged": False})
    assert no_consent.status_code == 422


async def test_create_503_without_provider(client, app):
    project = await setup_project(client)
    app.state.meeting_provider = None
    res = await client.post(base(project["id"]), json={"meeting_url": MEET, "consent_acknowledged": True})
    assert res.status_code == 503


async def test_create_502_saves_failed_row_when_bot_fails(client, app):
    project = await setup_project(client)

    class Broken:
        async def start_bot(self, **_):
            raise MeetingBotError("down")

    app.state.meeting_provider = Broken()
    res = await client.post(base(project["id"]), json={"meeting_url": MEET, "consent_acknowledged": True})
    assert res.status_code == 502
    listed = (await client.get(base(project["id"]))).json()
    assert listed[0]["status"] == "failed"
    assert listed[0]["failure_reason"] == "Notetaker service unavailable"


async def test_non_member_gets_404(client):
    project, _ = await setup(client)
    created = (await client.post(base(project["id"]), json={"meeting_url": MEET, "consent_acknowledged": True})).json()
    await _login(client, "alan@example.test")
    assert (await client.get(base(project["id"]))).status_code == 404
    assert (await client.get(f"{base(project['id'])}{created['id']}/")).status_code == 404


async def test_stop_is_idempotent_and_ends(client):
    project = await setup_project(client)
    created = (await client.post(base(project["id"]), json={"meeting_url": MEET, "consent_acknowledged": True})).json()
    url = f"{base(project['id'])}{created['id']}/stop/"
    first = await client.post(url)
    second = await client.post(url)
    assert first.status_code == second.status_code == 200
    assert second.json()["status"] == "ended"
    assert second.json()["notes_status"] == "pending"


async def test_apply_bot_state_upserts_and_is_sticky(db_session, make_project):
    from gigsnano_api.core.db import utcnow
    from gigsnano_api.features.meetings.service import apply_bot_state, list_segments
    from gigsnano_api.models.meetings import EMeetingPlatform, Meeting

    project = await make_project()
    m = Meeting(workspace_id=project.workspace_id, project_id=project.id, title="t",
                platform=EMeetingPlatform.ZOOM, meeting_url="u", native_meeting_id="1",
                status=S.JOINING, consent_acknowledged_at=utcnow())
    db_session.add(m)
    await db_session.flush()
    seg = lambda i, t: BotSegment(i, "Ada", t, i * 1000, i * 1000 + 900)  # noqa: E731
    await apply_bot_state(db_session, m, BotState(S.IN_CALL, [seg(0, "a"), seg(1, "b")]), utcnow())
    await apply_bot_state(db_session, m, BotState(S.IN_CALL, [seg(0, "a"), seg(1, "b2")]), utcnow())
    assert [s.text for s in await list_segments(db_session, m.id)] == ["a", "b2"]
    assert m.started_at is not None
    await apply_bot_state(db_session, m, BotState(S.ENDED, [seg(0, "a"), seg(1, "b2")]), utcnow())
    assert m.status is S.ENDED and m.ended_at is not None and m.notes_status == "pending"
    await apply_bot_state(db_session, m, BotState(S.IN_CALL, []), utcnow())
    assert m.status is S.ENDED


async def test_stop_meeting_still_stops_bot_when_get_state_fails(db_session, make_project):
    """get_state and stop_bot must not share one try/except — a get_state
    failure must not skip stop_bot and leave the bot stuck in the call."""
    from gigsnano_api.core.db import utcnow
    from gigsnano_api.features.meetings.service import stop_meeting
    from gigsnano_api.models.meetings import EMeetingPlatform, Meeting

    project = await make_project()
    m = Meeting(workspace_id=project.workspace_id, project_id=project.id, title="t",
                platform=EMeetingPlatform.ZOOM, meeting_url="u", native_meeting_id="1",
                status=S.IN_CALL, consent_acknowledged_at=utcnow())
    db_session.add(m)
    await db_session.flush()
    await db_session.commit()

    stop_calls = []

    class FlakyGetState:
        async def get_state(self, *, platform, native_meeting_id):
            raise MeetingBotError("vexa down")

        async def stop_bot(self, *, platform, native_meeting_id):
            stop_calls.append((platform, native_meeting_id))

    result = await stop_meeting(db_session, m, FlakyGetState())
    assert stop_calls == [(EMeetingPlatform.ZOOM, "1")]
    assert result.status is S.ENDED


async def test_apply_bot_state_unknown_status_does_not_change_status(db_session, make_project):
    """status=None means "the provider reported a status we don't recognise" —
    apply_bot_state must keep whatever status the meeting already has, not
    silently fall back to JOINING and regress an in-call meeting."""
    from gigsnano_api.core.db import utcnow
    from gigsnano_api.features.meetings.service import apply_bot_state
    from gigsnano_api.models.meetings import EMeetingPlatform, Meeting

    project = await make_project()
    m = Meeting(workspace_id=project.workspace_id, project_id=project.id, title="t",
                platform=EMeetingPlatform.ZOOM, meeting_url="u", native_meeting_id="1",
                status=S.IN_CALL, started_at=utcnow(), consent_acknowledged_at=utcnow())
    db_session.add(m)
    await db_session.flush()

    await apply_bot_state(db_session, m, BotState(None), utcnow())
    assert m.status is S.IN_CALL


async def test_apply_bot_state_never_regresses_a_started_meeting_to_pre_call(db_session, make_project):
    """Once a meeting has started_at set, the provider reporting a pre-call
    status again (e.g. a stale/racing Vexa poll) must not move it backwards —
    that would re-arm the 20-minute admission timeout on a live meeting."""
    from gigsnano_api.core.db import utcnow
    from gigsnano_api.features.meetings.service import apply_bot_state
    from gigsnano_api.models.meetings import EMeetingPlatform, Meeting

    project = await make_project()
    m = Meeting(workspace_id=project.workspace_id, project_id=project.id, title="t",
                platform=EMeetingPlatform.ZOOM, meeting_url="u", native_meeting_id="1",
                status=S.IN_CALL, started_at=utcnow(), consent_acknowledged_at=utcnow())
    db_session.add(m)
    await db_session.flush()

    await apply_bot_state(db_session, m, BotState(S.WAITING_ADMISSION), utcnow())
    assert m.status is S.IN_CALL


async def test_expire_if_unadmitted_only_applies_before_started(db_session, make_project):
    """A meeting whose started_at is already set must never be expired for
    non-admission, even if its stored status is somehow still pre-call."""
    from datetime import timedelta

    from gigsnano_api.core.db import utcnow
    from gigsnano_api.features.meetings.service import expire_if_unadmitted
    from gigsnano_api.models.meetings import EMeetingPlatform, Meeting

    project = await make_project()
    now = utcnow()
    m = Meeting(workspace_id=project.workspace_id, project_id=project.id, title="t",
                platform=EMeetingPlatform.ZOOM, meeting_url="u", native_meeting_id="1",
                status=S.WAITING_ADMISSION, started_at=now - timedelta(minutes=30),
                consent_acknowledged_at=now, created_at=now - timedelta(minutes=30))
    db_session.add(m)
    await db_session.flush()

    assert expire_if_unadmitted(m, now) is False
    assert m.status is S.WAITING_ADMISSION
