from gigsnano_api.auth.models import User
from gigsnano_api.models import ENotificationKind, Notification, Sticky, Workspace


async def _ws(db_session):
    user = User(email="ada@example.test", display_name="Ada Lovelace", password_hash="x")
    ws = Workspace(slug="acme", name="Acme")
    db_session.add_all([user, ws])
    await db_session.flush()
    return ws, user


async def test_sticky_and_notification_defaults(db_session):
    ws, user = await _ws(db_session)
    sticky = Sticky(workspace_id=ws.id)
    # receiver_id is required (personal inboxes); defaults under test are body/href/read.
    note = Notification(workspace_id=ws.id, receiver_id=user.id,
                        kind=ENotificationKind.ASSIGNMENT, title="Assigned: X")
    db_session.add_all([sticky, note])
    await db_session.commit()
    assert sticky.body == "" and sticky.color == "#fbbf24"
    assert note.read is False and note.body == "" and note.href is None
    assert ENotificationKind.SPRINT.value == "sprint"
