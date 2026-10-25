from tests.helpers import make_staff  # reuse the staff bootstrap helper


async def test_role_crud_and_audit(client, db_session):
    await make_staff(client, db_session)  # Superadmin

    # create
    res = await client.post("/api/admin/roles/", json={
        "name": "Support", "description": "Read-only", "privileges": ["users.read", "audit.read"]})
    assert res.status_code == 201
    role = res.json()
    assert role["privileges"] == ["audit.read", "users.read"]  # sorted
    assert role["is_system"] is False and role["member_count"] == 0

    # list (includes Superadmin + Support)
    names = {r["name"] for r in (await client.get("/api/admin/roles/")).json()}
    assert {"Superadmin", "Support"} <= names

    # patch
    patched = (await client.patch(f"/api/admin/roles/{role['id']}/", json={
        "privileges": ["users.read"]})).json()
    assert patched["privileges"] == ["users.read"]

    # delete
    assert (await client.delete(f"/api/admin/roles/{role['id']}/")).status_code == 204

    # audit trail recorded create/update/delete
    from sqlalchemy import select

    from gigsnano_api.models import AuditLog
    actions = {r.action for r in (await db_session.execute(select(AuditLog))).scalars().all()}
    assert {"role.create", "role.update", "role.delete"} <= actions


async def test_reject_unknown_privilege(client, db_session):
    await make_staff(client, db_session)
    res = await client.post("/api/admin/roles/", json={"name": "Bad", "privileges": ["nope.bad"]})
    assert res.status_code == 422


async def test_system_role_protected(client, db_session):
    await make_staff(client, db_session)
    su = next(r for r in (await client.get("/api/admin/roles/")).json() if r["is_system"])
    assert (await client.patch(f"/api/admin/roles/{su['id']}/", json={"name": "X"})).status_code == 400
    assert (await client.delete(f"/api/admin/roles/{su['id']}/")).status_code == 400


async def test_delete_role_with_members_blocked(client, db_session):
    role = await make_staff(client, db_session)  # returns the Superadmin role; make a 2nd role w/ member
    from gigsnano_api.models import StaffMember, StaffRole
    r2 = StaffRole(name="Mod", privileges=["marketplace.moderate"], is_system=False)
    db_session.add(r2)
    await db_session.flush()
    db_session.add(StaffMember(user_id="other", role_id=r2.id, is_active=True))
    await db_session.commit()
    assert (await client.delete(f"/api/admin/roles/{r2.id}/")).status_code == 409


async def test_roles_requires_manage_to_write(client, db_session):
    await make_staff(client, db_session, is_system=False, privileges=["roles.read"])
    assert (await client.get("/api/admin/roles/")).status_code == 200
    assert (await client.post("/api/admin/roles/", json={"name": "X"})).status_code == 403
