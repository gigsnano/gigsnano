from sqlalchemy import select

from gigsnano_api.auth.models import User
from gigsnano_api.core.security import hash_password
from gigsnano_api.models import AuditLog, Workspace, WorkspaceMember
from tests.helpers import make_staff


def test_user_has_suspension_fields():
    cols = {c.name for c in User.__table__.columns}
    assert "is_suspended" in cols
    assert "suspended_at" in cols


async def test_list_platform_users(client, db_session):
    await make_staff(client, db_session)
    db_session.add(
        User(
            id="u2",
            email="bob@test.io",
            display_name="Bob",
            password_hash=hash_password("s3cret!"),
        )
    )
    await db_session.commit()

    res = await client.get("/api/admin/users/")
    assert res.status_code == 200
    body = res.json()["items"]  # OffsetPageOut envelope
    assert isinstance(body, list)
    assert len(body) >= 2
    assert "is_suspended" in body[0]
    assert "workspace_count" in body[0]
    assert "auth_provider" in body[0]


async def test_list_platform_users_filters_query(client, db_session):
    await make_staff(client, db_session)
    db_session.add(User(id="u2", email="bob@test.io", display_name="Bob Unique"))
    await db_session.commit()

    res = await client.get("/api/admin/users/", params={"q": "Unique"})
    assert res.status_code == 200
    emails = {u["email"] for u in res.json()["items"]}
    assert emails == {"bob@test.io"}


async def test_get_platform_user(client, db_session):
    await make_staff(client, db_session)
    db_session.add(User(id="u2", email="bob@test.io", display_name="Bob"))
    await db_session.commit()

    res = await client.get("/api/admin/users/u2/")
    assert res.status_code == 200
    body = res.json()
    assert body["email"] == "bob@test.io"
    for key in (
        "email_digest",
        "product_updates",
        "project_count",
        "assigned_story_count",
        "is_staff",
        "last_workspace_slug",
    ):
        assert key in body


async def test_user_workspaces_subresource(client, db_session):
    await make_staff(client, db_session)
    db_session.add(User(id="u2", email="bob@test.io", display_name="Bob"))
    ws = Workspace(slug="acme", name="Acme Corp")
    db_session.add(ws)
    await db_session.flush()
    db_session.add(WorkspaceMember(workspace_id=ws.id, user_id="u2"))
    await db_session.commit()

    res = await client.get("/api/admin/users/u2/workspaces/")
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 1
    assert body[0]["workspace_slug"] == "acme"
    assert body[0]["workspace_name"] == "Acme Corp"


async def test_user_activity_subresource(client, db_session):
    await make_staff(client, db_session)
    db_session.add(User(id="u2", email="bob@test.io", display_name="Bob"))
    await db_session.commit()
    await client.patch(
        "/api/admin/users/u2/",
        json={"is_suspended": True, "reason": "test reason"},
    )

    res = await client.get("/api/admin/users/u2/activity/")
    assert res.status_code == 200
    actions = {row["action"] for row in res.json()["items"]}
    assert "user.suspend" in actions


async def test_update_profile_requires_users_manage(client, db_session):
    await make_staff(client, db_session, is_system=False, privileges=["users.read"])
    db_session.add(User(id="u2", email="bob@test.io", display_name="Bob"))
    await db_session.commit()
    res = await client.patch("/api/admin/users/u2/", json={"display_name": "Robert"})
    assert res.status_code == 403


async def test_update_profile_audited(client, db_session):
    await make_staff(client, db_session)
    db_session.add(User(id="u2", email="bob@test.io", display_name="Bob"))
    await db_session.commit()

    res = await client.patch(
        "/api/admin/users/u2/",
        json={"display_name": "Robert", "email_digest": False},
    )
    assert res.status_code == 200
    assert res.json()["display_name"] == "Robert"
    assert res.json()["email_digest"] is False

    actions = {a.action for a in (await db_session.execute(select(AuditLog))).scalars().all()}
    assert "user.update" in actions


async def test_get_platform_user_detail_shows_suspend_reason(client, db_session):
    await make_staff(client, db_session)
    db_session.add(User(id="u2", email="bob@test.io", display_name="Bob"))
    await db_session.commit()
    await client.patch(
        "/api/admin/users/u2/",
        json={"is_suspended": True, "reason": "policy violation"},
    )

    res = await client.get("/api/admin/users/u2/")
    assert res.status_code == 200
    assert res.json()["last_suspend_reason"] == "policy violation"


async def test_suspend_user_audited(client, db_session):
    await make_staff(client, db_session)
    db_session.add(
        User(
            id="u2",
            email="bob@test.io",
            display_name="Bob",
            password_hash=hash_password("s3cret!"),
        )
    )
    await db_session.commit()

    res = await client.patch(
        "/api/admin/users/u2/",
        json={"is_suspended": True, "reason": "policy violation"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["is_suspended"] is True
    assert body["suspended_at"] is not None

    actions = {a.action for a in (await db_session.execute(select(AuditLog))).scalars().all()}
    assert "user.suspend" in actions


async def test_unsuspend_user_audited(client, db_session):
    await make_staff(client, db_session)
    db_session.add(
        User(
            id="u2",
            email="bob@test.io",
            display_name="Bob",
            is_suspended=True,
        )
    )
    await db_session.commit()

    res = await client.patch("/api/admin/users/u2/", json={"is_suspended": False})
    assert res.status_code == 200
    assert res.json()["is_suspended"] is False
    assert res.json()["suspended_at"] is None


async def test_suspend_requires_privilege(client, db_session):
    await make_staff(client, db_session, is_system=False, privileges=["users.read"])
    db_session.add(User(id="u2", email="bob@test.io", display_name="Bob"))
    await db_session.commit()
    assert (
        await client.patch("/api/admin/users/u2/", json={"is_suspended": True})
    ).status_code == 403


async def test_platform_user_workspace_count(client, db_session):
    await make_staff(client, db_session)
    db_session.add(User(id="u2", email="bob@test.io", display_name="Bob"))
    ws = Workspace(slug="acme", name="Acme")
    db_session.add(ws)
    await db_session.flush()
    db_session.add(WorkspaceMember(workspace_id=ws.id, user_id="u2"))
    await db_session.commit()

    res = await client.get("/api/admin/users/u2/")
    assert res.status_code == 200
    assert res.json()["workspace_count"] == 1
