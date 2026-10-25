from sqlalchemy import select

from gigsnano_api.models import AuditLog
from tests.helpers import make_staff


async def test_me_returns_identity_and_privileges(client, db_session):
    await make_staff(client, db_session)
    res = await client.get("/api/admin/me/")
    assert res.status_code == 200
    body = res.json()
    assert body["email"] == "ada@example.test"
    assert body["is_superadmin"] is True
    assert "roles.manage" in body["privileges"]


async def test_me_emits_admin_access_audit(client, db_session):
    await make_staff(client, db_session)
    await client.get("/api/admin/me/")
    logs = (await db_session.execute(
        select(AuditLog).where(AuditLog.action == "admin.access")
    )).scalars().all()
    assert len(logs) >= 1


async def test_privileges_catalog(client, db_session):
    await make_staff(client, db_session, is_system=False, privileges=["roles.read"])
    res = await client.get("/api/admin/privileges/")
    assert res.status_code == 200
    keys = {p["key"] for p in res.json()}
    assert "roles.manage" in keys and len(keys) == 15


async def test_privileges_requires_roles_read(client, db_session):
    await make_staff(client, db_session, is_system=False, privileges=["audit.read"])
    assert (await client.get("/api/admin/privileges/")).status_code == 403
