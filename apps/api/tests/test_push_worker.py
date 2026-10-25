import asyncio
import json
from contextlib import asynccontextmanager
from datetime import timedelta

import httpx
from sqlalchemy import select

from gigsnano_api.core.db import utcnow
from gigsnano_api.features.notifications.router import notify
from gigsnano_api.features.push.sender import FakePushSender, HttpxExpoPushSender, PushTicket
from gigsnano_api.features.push.worker import claim_due, deliver, push_worker, run_push_tick
from gigsnano_api.models import (
    DeviceToken,
    ENotificationKind,
    NotificationTemplate,
    PushOutbox,
    User,
)


async def _user(db, email="u@example.test", realtime=True) -> User:
    user = User(email=email, display_name="U", push_realtime=realtime)
    db.add(user)
    await db.flush()
    return user


def _device(user, token) -> DeviceToken:
    return DeviceToken(user_id=user.id, token=token, platform="ios", last_seen_at=utcnow())


def _row(user, category="realtime") -> PushOutbox:
    return PushOutbox(user_id=user.id, category=category, title="T", body="B",
                      data={"route": "/inbox"})


class _Sender:
    def __init__(self, tickets=None, error=None):
        self.tickets, self.error = tickets, error

    async def send(self, messages):
        if self.error:
            raise self.error
        return self.tickets or [PushTicket(True, None) for _ in messages]


async def _outcomes(db) -> dict[str, str | None]:
    db.expire_all()
    rows = (await db.execute(select(PushOutbox))).scalars().all()
    return {r.category: r.outcome for r in rows}


async def test_muted_user_skips_realtime_but_gets_briefing(db_session):
    user = await _user(db_session, realtime=False)
    db_session.add_all([_device(user, "ExponentPushToken[a]"), _row(user), _row(user, "briefing")])
    await db_session.commit()
    sender = FakePushSender()
    await run_push_tick(db_session, sender, now=utcnow())
    assert await _outcomes(db_session) == {"briefing": "sent", "realtime": "muted"}
    assert len(sender.sent) == 1


async def test_old_row_expires(db_session):
    user = await _user(db_session)
    db_session.add_all([_device(user, "ExponentPushToken[a]"), _row(user)])
    await db_session.commit()
    sender = FakePushSender()
    await run_push_tick(db_session, sender, now=utcnow() + timedelta(hours=2))
    assert await _outcomes(db_session) == {"realtime": "expired"}
    assert sender.sent == []


async def test_no_device(db_session):
    user = await _user(db_session)
    db_session.add(_row(user))
    await db_session.commit()
    await run_push_tick(db_session, FakePushSender(), now=utcnow())
    assert await _outcomes(db_session) == {"realtime": "no_device"}


async def test_two_devices_two_messages(db_session):
    user = await _user(db_session)
    db_session.add_all([_device(user, "ExponentPushToken[a]"), _device(user, "ExponentPushToken[b]"),
                        _row(user)])
    await db_session.commit()
    sender = FakePushSender()
    assert await run_push_tick(db_session, sender, now=utcnow()) == 1
    assert {m.to for m in sender.sent} == {"ExponentPushToken[a]", "ExponentPushToken[b]"}


async def test_dead_token_deleted(db_session):
    user = await _user(db_session)
    db_session.add_all([_device(user, "ExponentPushToken[a]"), _row(user)])
    await db_session.commit()
    await run_push_tick(db_session, _Sender([PushTicket(False, "DeviceNotRegistered")]),
                        now=utcnow())
    assert (await db_session.execute(select(DeviceToken))).scalars().all() == []
    assert await _outcomes(db_session) == {"realtime": "failed"}


async def test_sender_crash_settles_rows_failed_transient_without_retry(db_session):
    user = await _user(db_session)
    db_session.add_all([_device(user, "ExponentPushToken[a]"), _row(user)])
    await db_session.commit()
    assert await run_push_tick(db_session, _Sender(error=RuntimeError("x")), now=utcnow()) == 1
    assert await _outcomes(db_session) == {"realtime": "failed_transient"}
    retry = FakePushSender()
    assert await run_push_tick(db_session, retry, now=utcnow()) == 0
    assert retry.sent == []


async def test_claimed_rows_are_invisible_to_a_second_tick(db_session):
    user = await _user(db_session)
    db_session.add_all([_device(user, "ExponentPushToken[a]"), _row(user)])
    await db_session.commit()
    claim = await claim_due(db_session, utcnow())  # tick A claims and commits
    assert await _outcomes(db_session) == {"realtime": "sending"}
    sender_b = FakePushSender()
    assert await run_push_tick(db_session, sender_b, now=utcnow()) == 0  # tick B
    assert sender_b.sent == []
    sender_a = FakePushSender()
    await deliver(db_session, sender_a, claim, utcnow())
    assert len(sender_a.sent) == 1
    assert await _outcomes(db_session) == {"realtime": "sent"}


async def test_chunk_two_failure_never_resends_chunk_one(db_session):
    user = await _user(db_session)
    db_session.add(_device(user, "ExponentPushToken[a]"))
    db_session.add_all([_row(user) for _ in range(101)])
    await db_session.commit()
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 2:
            return httpx.Response(503)
        n = len(json.loads(request.content))
        return httpx.Response(200, json={"data": [{"status": "ok"}] * n})

    sender = HttpxExpoPushSender(transport=httpx.MockTransport(handler))
    assert await run_push_tick(db_session, sender, now=utcnow()) == 101
    assert await run_push_tick(db_session, sender, now=utcnow()) == 0
    assert calls["n"] == 2
    db_session.expire_all()
    outcomes = [r.outcome for r in (await db_session.execute(select(PushOutbox))).scalars()]
    assert sorted(outcomes).count("sent") == 100 and outcomes.count("failed_transient") == 1


async def test_notify_enqueues_push_for_assignment_not_system(db_session, make_workspace):
    ws = await make_workspace()
    user = await _user(db_session)
    for kind in (ENotificationKind.ASSIGNMENT, ENotificationKind.SYSTEM):
        await notify(db_session, ws.id, receiver_id=user.id, kind=kind, title="Hi")
    await db_session.commit()
    rows = (await db_session.execute(select(PushOutbox))).scalars().all()
    assert len(rows) == 1 and rows[0].category == "realtime" and rows[0].data == {"route": "/inbox"}


async def test_api_assignment_enqueues_for_assignee(client, db_session):
    from tests.test_notifications import _project_with_member

    db_session.add(NotificationTemplate(
        trigger_key="story.assigned", kind=ENotificationKind.ASSIGNMENT, label="a",
        description="d", title_template="{story}", body_template="{actor}",
        default_title_template="{story}", default_body_template="{actor}",
        variables=["actor", "project", "story"], enabled=True))
    await db_session.commit()
    project, alan_id = await _project_with_member(client)
    pid = project["id"]
    story = (await client.post(f"/api/workspaces/acme/projects/{pid}/stories/",
                               json={"title": "Do it"})).json()
    await client.patch(f"/api/workspaces/acme/projects/{pid}/stories/{story['id']}/",
                       json={"assignee_id": alan_id})
    rows = (await db_session.execute(select(PushOutbox))).scalars().all()
    assert [r.user_id for r in rows if r.title == "Do it"] == [alan_id]


async def test_worker_survives_failed_tick(db_session, monkeypatch):
    calls = {"n": 0}

    async def flaky(db, sender, *, now):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("stale connection")
        return 0

    monkeypatch.setattr("gigsnano_api.features.push.worker.run_push_tick", flaky)
    @asynccontextmanager
    async def factory():
        yield db_session

    task = asyncio.create_task(
        push_worker(FakePushSender(), interval=0.01, session_factory=factory)
    )
    await asyncio.sleep(0.2)
    task.cancel()
    assert calls["n"] >= 2
