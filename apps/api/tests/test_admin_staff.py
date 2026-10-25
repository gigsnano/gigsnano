from sqlalchemy import select

from gigsnano_api.auth.models import User
from gigsnano_api.models import AuditLog, StaffMember, StaffRole
from tests.helpers import make_staff


async def test_staff_grant_update_revoke(client, db_session):
    await make_staff(client, db_session)  # signed-in Superadmin
    # a second user to grant staff to
    db_session.add(User(id="u2", email="mod@acme.test", display_name="Mod"))
    r = StaffRole(name="Mod", privileges=["marketplace.moderate"], is_system=False)
    db_session.add(r)
    await db_session.commit()

    res = await client.post("/api/admin/staff/", json={"user_id": "u2", "role_id": r.id})
    assert res.status_code == 201
    member = res.json()
    assert member["email"] == "mod@acme.test" and member["role_name"] == "Mod" and member["is_active"]

    lst = (await client.get("/api/admin/staff/")).json()
    assert any(m["user_id"] == "u2" for m in lst)

    patched = (await client.patch(f"/api/admin/staff/{member['id']}/", json={"is_active": False})).json()
    assert patched["is_active"] is False

    assert (await client.delete(f"/api/admin/staff/{member['id']}/")).status_code == 204

    actions = {a.action for a in (await db_session.execute(select(AuditLog))).scalars().all()}
    assert {"staff.grant", "staff.update", "staff.revoke"} <= actions


async def test_grant_duplicate_is_409(client, db_session):
    await make_staff(client, db_session)
    db_session.add(User(id="u2", email="mod@acme.test", display_name="Mod"))
    r = StaffRole(name="Mod", privileges=[], is_system=False)
    db_session.add(r)
    await db_session.commit()
    assert (await client.post("/api/admin/staff/", json={"user_id": "u2", "role_id": r.id})).status_code == 201
    assert (await client.post("/api/admin/staff/", json={"user_id": "u2", "role_id": r.id})).status_code == 409


async def test_staff_requires_manage(client, db_session):
    await make_staff(client, db_session, is_system=False, privileges=["audit.read"])
    assert (await client.get("/api/admin/staff/")).status_code == 403


async def test_grant_system_role_requires_superadmin_actor(client, db_session):
    # a non-system staff.manage holder tries to grant the Superadmin role — must be blocked
    await make_staff(client, db_session, is_system=False, privileges=["staff.manage"])
    db_session.add(User(id="u2", email="target@acme.test", display_name="Target"))
    superadmin_role = (
        await db_session.execute(select(StaffRole).where(StaffRole.is_system.is_(True)))
    ).scalar_one_or_none()
    if superadmin_role is None:
        superadmin_role = StaffRole(name="Superadmin", privileges=[], is_system=True)
        db_session.add(superadmin_role)
    await db_session.commit()

    res = await client.post(
        "/api/admin/staff/", json={"user_id": "u2", "role_id": superadmin_role.id}
    )
    assert res.status_code == 403


async def test_grant_system_role_succeeds_for_superadmin_actor(client, db_session):
    superadmin_role = await make_staff(client, db_session)  # Superadmin actor
    db_session.add(User(id="u2", email="target2@acme.test", display_name="Target2"))
    await db_session.commit()

    res = await client.post(
        "/api/admin/staff/", json={"user_id": "u2", "role_id": superadmin_role.id}
    )
    assert res.status_code == 201
    assert res.json()["role_name"] == "Superadmin"


async def test_update_staff_to_system_role_requires_superadmin_actor(client, db_session):
    await make_staff(client, db_session, is_system=False, privileges=["staff.manage"])
    db_session.add(User(id="u3", email="target3@acme.test", display_name="Target3"))
    mod_role = StaffRole(name="Mod", privileges=[], is_system=False)
    superadmin_role = (
        await db_session.execute(select(StaffRole).where(StaffRole.is_system.is_(True)))
    ).scalar_one_or_none()
    if superadmin_role is None:
        superadmin_role = StaffRole(name="Superadmin", privileges=[], is_system=True)
        db_session.add(superadmin_role)
    db_session.add(mod_role)
    await db_session.flush()
    member = StaffMember(user_id="u3", role_id=mod_role.id, is_active=True)
    db_session.add(member)
    await db_session.commit()

    res = await client.patch(
        f"/api/admin/staff/{member.id}/", json={"role_id": superadmin_role.id}
    )
    assert res.status_code == 403


async def test_update_staff_to_system_role_succeeds_for_superadmin_actor(client, db_session):
    superadmin_role = await make_staff(client, db_session)  # Superadmin actor
    db_session.add(User(id="u4", email="target4@acme.test", display_name="Target4"))
    mod_role = StaffRole(name="Mod2", privileges=[], is_system=False)
    db_session.add(mod_role)
    await db_session.flush()
    member = StaffMember(user_id="u4", role_id=mod_role.id, is_active=True)
    db_session.add(member)
    await db_session.commit()

    res = await client.patch(
        f"/api/admin/staff/{member.id}/", json={"role_id": superadmin_role.id}
    )
    assert res.status_code == 200
    assert res.json()["role_name"] == "Superadmin"
