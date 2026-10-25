from gigsnano_api.models import SlackConnection, Workspace
from gigsnano_api.sync.token_crypto import encrypt_token
from gigsnano_api.webhooks import events as ev
from gigsnano_api.webhooks.slack_sender import FakeSlackSender


class Recorder:
    def __init__(self):
        self.calls = []

    def add_task(self, fn, *args):
        self.calls.append((fn, args))


async def _connected_workspace(db_session, **overrides) -> Workspace:
    ws = Workspace(slug="acme", name="Acme")
    db_session.add(ws)
    await db_session.flush()
    defaults = {
        "workspace_id": ws.id,
        "access_token_encrypted": encrypt_token("tok"),
        "team_id": "T1",
        "team_name": "Acme",
        "bot_user_id": "U1",
        "default_channel_id": "C1",
        "notify_events": ["story.created"],
    }
    defaults.update(overrides)
    db_session.add(SlackConnection(**defaults))
    await db_session.commit()
    return ws


async def test_dispatch_to_slack_enqueues_when_connected_and_subscribed(db_session):
    ws = await _connected_workspace(db_session)
    rec = Recorder()
    await ev.dispatch_to_slack(
        db_session, ws.id, "acme", "story.created", {"title": "Fix login"},
        background=rec, slack_sender=FakeSlackSender(),
    )
    assert len(rec.calls) == 1
    fn, args = rec.calls[0]
    assert fn is ev._deliver_slack_in_fresh_session


async def test_dispatch_to_slack_noop_when_event_not_subscribed(db_session):
    ws = await _connected_workspace(db_session, notify_events=["sprint.completed"])
    rec = Recorder()
    await ev.dispatch_to_slack(
        db_session, ws.id, "acme", "story.created", {},
        background=rec, slack_sender=FakeSlackSender(),
    )
    assert rec.calls == []


async def test_dispatch_to_slack_noop_when_not_connected(db_session):
    ws = Workspace(slug="acme", name="Acme")
    db_session.add(ws)
    await db_session.commit()
    rec = Recorder()
    await ev.dispatch_to_slack(
        db_session, ws.id, "acme", "story.created", {},
        background=rec, slack_sender=FakeSlackSender(),
    )
    assert rec.calls == []


async def test_deliver_slack_in_fresh_session_calls_sender(monkeypatch, db_engine, db_session):
    from sqlalchemy.ext.asyncio import async_sessionmaker

    from gigsnano_api.core import db as core_db

    fresh_maker = async_sessionmaker(db_engine, expire_on_commit=False)
    monkeypatch.setattr(core_db, "async_session", fresh_maker)

    from sqlalchemy import select

    ws = await _connected_workspace(db_session)
    conn = (
        await db_session.execute(
            select(SlackConnection).where(SlackConnection.workspace_id == ws.id)
        )
    ).scalar_one()

    sent = []

    class RecordingSender(FakeSlackSender):
        async def send(self, *, token, channel_id, text):
            sent.append((token, channel_id, text))
            return await super().send(token=token, channel_id=channel_id, text=text)

    await ev._deliver_slack_in_fresh_session(RecordingSender(), conn.id, "hello")
    assert sent == [("tok", "C1", "hello")]


async def test_dispatch_event_also_dispatches_to_slack(db_session):
    """End-to-end through dispatch_event (the real call site used by stories/router.py)."""
    ws = await _connected_workspace(db_session)
    rec = Recorder()
    from gigsnano_api.webhooks.sender import FakeWebhookSender

    await ev.dispatch_event(
        db_session, ws.id, "acme", "story.created", {"title": "x"},
        background=rec, sender=FakeWebhookSender(), slack_sender=FakeSlackSender(),
    )
    assert any(fn is ev._deliver_slack_in_fresh_session for fn, _ in rec.calls)
