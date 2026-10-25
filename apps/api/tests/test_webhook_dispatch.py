from types import SimpleNamespace

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from gigsnano_api.models import EDeliveryStatus, Webhook, WebhookDelivery, Workspace
from gigsnano_api.webhooks import events as ev
from gigsnano_api.webhooks.sender import DeliveryResult, FakeWebhookSender


class Recorder:
    """Stand-in for FastAPI BackgroundTasks — records enqueued calls."""

    def __init__(self):
        self.calls = []

    def add_task(self, fn, *args):
        self.calls.append((fn, args))


class FailSender:
    async def send(self, **kwargs):
        return DeliveryResult(EDeliveryStatus.FAILED, 500)


def test_catalog_has_the_four_events():
    assert ev.WEBHOOK_EVENTS == {
        "story.created", "story.updated", "story.assigned", "sprint.completed",
    }


async def test_subscribed_filters_by_enabled_and_event(db_session):
    ws = Workspace(slug="acme", name="Acme")
    db_session.add(ws)
    await db_session.flush()
    on = Webhook(workspace_id=ws.id, url="u", events=["story.created"], secret="s", enabled=True)
    off = Webhook(workspace_id=ws.id, url="u", events=["story.created"], secret="s", enabled=False)
    other = Webhook(workspace_id=ws.id, url="u", events=["sprint.completed"], secret="s", enabled=True)
    db_session.add_all([on, off, other])
    await db_session.commit()

    hooks = await ev.webhooks_subscribed_to(db_session, ws.id, "story.created")
    assert [h.id for h in hooks] == [on.id]


async def test_deliver_writes_success_and_failed_rows(db_session):
    ws = Workspace(slug="acme", name="Acme")
    db_session.add(ws)
    await db_session.flush()
    wh = Webhook(workspace_id=ws.id, url="u", events=["story.created"], secret="s")
    db_session.add(wh)
    await db_session.flush()

    ok = await ev.deliver(db_session, FakeWebhookSender(), wh, "story.created", {"a": 1})
    assert ok.status == EDeliveryStatus.SUCCESS and ok.response_code == 200
    bad = await ev.deliver(db_session, FailSender(), wh, "story.created", {"a": 1})
    assert bad.status == EDeliveryStatus.FAILED and bad.response_code == 500


async def test_dispatch_enqueues_one_task_per_matching_webhook(db_session):
    ws = Workspace(slug="acme", name="Acme")
    db_session.add(ws)
    await db_session.flush()
    a = Webhook(workspace_id=ws.id, url="u", events=["story.created"], secret="s")
    b = Webhook(workspace_id=ws.id, url="u", events=["story.updated"], secret="s")
    db_session.add_all([a, b])
    await db_session.commit()

    rec = Recorder()
    await ev.dispatch_event(
        db_session, ws.id, "acme", "story.created", {"x": 1},
        background=rec, sender=FakeWebhookSender(),
    )
    assert len(rec.calls) == 1
    fn, args = rec.calls[0]
    assert fn is ev._deliver_in_fresh_session
    assert args[1] == a.id and args[2] == "story.created"
    assert args[3] == {"event": "story.created", "workspace": "acme", "data": {"x": 1}}


async def test_dispatch_noop_when_none_subscribed(db_session):
    ws = Workspace(slug="acme", name="Acme")
    db_session.add(ws)
    await db_session.commit()
    rec = Recorder()
    await ev.dispatch_event(
        db_session, ws.id, "acme", "story.created", {},
        background=rec, sender=FakeWebhookSender(),
    )
    assert rec.calls == []


async def test_deliver_in_fresh_session_writes_delivery_row(monkeypatch, db_engine, db_session):
    """Exercises _deliver_in_fresh_session end-to-end on the test engine.

    The function opens its OWN `async_session()` (deferred import from core.db) rather
    than reusing the caller's session, so we monkeypatch `core.db.async_session` to a
    sessionmaker bound to the same StaticPool test engine `db_session` uses.
    """
    from gigsnano_api.core import db as core_db

    fresh_maker = async_sessionmaker(db_engine, expire_on_commit=False)
    monkeypatch.setattr(core_db, "async_session", fresh_maker)

    ws = Workspace(slug="acme", name="Acme")
    db_session.add(ws)
    await db_session.flush()
    wh = Webhook(workspace_id=ws.id, url="u", events=["story.created"], secret="s")
    db_session.add(wh)
    await db_session.commit()
    webhook_id = wh.id

    await ev._deliver_in_fresh_session(
        FakeWebhookSender(), webhook_id, "story.created",
        {"event": "story.created", "workspace": "acme", "data": {}},
    )

    db_session.expire_all()
    rows = (
        await db_session.execute(
            select(WebhookDelivery).where(WebhookDelivery.webhook_id == webhook_id)
        )
    ).scalars().all()
    assert len(rows) == 1
    assert rows[0].status == EDeliveryStatus.SUCCESS
    assert rows[0].response_code == 200


async def test_sprint_transition_fires_only_on_false_to_true(monkeypatch):
    fired = []

    async def fake_dispatch(db, wid, slug, event, data, **kwargs):
        fired.append(event)

    async def now_complete(db, pid):
        return True

    monkeypatch.setattr(ev, "dispatch_event", fake_dispatch)
    monkeypatch.setattr(ev, "sprint_zero_complete", now_complete)
    project = SimpleNamespace(id="p1", workspace_id="w1")
    rec = Recorder()

    await ev.dispatch_sprint_completed_if_transitioned(
        None, project, "acme", False, background=rec, sender=FakeWebhookSender()
    )
    assert fired == ["sprint.completed"]

    fired.clear()
    await ev.dispatch_sprint_completed_if_transitioned(
        None, project, "acme", True, background=rec, sender=FakeWebhookSender()
    )
    assert fired == []
