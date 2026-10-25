from gigsnano_api.email.provider import FakeEmailProvider
from gigsnano_api.features.notifications.router import resolve_and_notify
from gigsnano_api.models import ENotificationKind, NotificationTemplate


async def _seed_tpl(db, email_enabled: bool) -> None:
    db.add(
        NotificationTemplate(
            trigger_key="test.event",
            kind=ENotificationKind.SYSTEM,
            label="Test event",
            description="Bridge test.",
            title_template="T {x}",
            body_template="B {x}",
            default_title_template="T {x}",
            default_body_template="B {x}",
            variables=["x"],
            enabled=True,
            email_enabled=email_enabled,
            email_subject_template="Subj {x}",
            email_body_html_template="<p>{x}</p>",
        )
    )
    await db.flush()


async def test_bridge_sends_when_enabled_and_opted_in(
    db_session, make_workspace_member_user, background_tasks_stub
):
    FakeEmailProvider.reset()
    ws, user = await make_workspace_member_user(email_digest=True)
    await _seed_tpl(db_session, email_enabled=True)
    await resolve_and_notify(
        db_session,
        ws.id,
        user.id,
        trigger_key="test.event",
        context={"x": "42"},
        kind=ENotificationKind.SYSTEM,
        href=None,
        background=background_tasks_stub,
        provider=FakeEmailProvider(),
    )
    await background_tasks_stub.run_all()
    assert any("42" in m["subject"] for m in FakeEmailProvider.sent)


async def test_bridge_skips_when_toggle_off(
    db_session, make_workspace_member_user, background_tasks_stub
):
    FakeEmailProvider.reset()
    ws, user = await make_workspace_member_user(email_digest=False)
    await _seed_tpl(db_session, email_enabled=True)
    await resolve_and_notify(
        db_session,
        ws.id,
        user.id,
        trigger_key="test.event",
        context={"x": "9"},
        kind=ENotificationKind.SYSTEM,
        href=None,
        background=background_tasks_stub,
        provider=FakeEmailProvider(),
    )
    await background_tasks_stub.run_all()
    assert FakeEmailProvider.sent == []
