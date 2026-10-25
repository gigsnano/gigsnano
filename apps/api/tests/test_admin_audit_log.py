from datetime import datetime

from sqlalchemy import select

from gigsnano_api.auth.models import User
from gigsnano_api.models import StaffMember, StaffRole
from tests.helpers import make_staff


async def test_audit_log_survives_actor_revocation(client, db_session):
    # Ada acts (emits audit rows), then her StaffMember is hard-deleted (revoked).
    # actor_name was denormalized onto the row at write time, so attribution
    # should NOT collapse to "—" even though the StaffMember row is gone.
    await make_staff(client, db_session)  # Superadmin, display_name "Ada"
    await client.get("/api/admin/me/")  # emits admin.access, actor_name="Ada"

    staff_list = (await client.get("/api/admin/staff/")).json()
    ada_member_id = staff_list[0]["id"]
    assert (await client.delete(f"/api/admin/staff/{ada_member_id}/")).status_code == 204

    # Ada is no longer staff (revoked), so sign in a fresh superadmin to read the logs.
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Reader", "email": "reader@acme.test", "password": "s3cret!"})
    reader_id = (
        await db_session.execute(select(User).where(User.email == "reader@acme.test"))
    ).scalar_one().id
    reader_role = (
        await db_session.execute(select(StaffRole).where(StaffRole.is_system.is_(True)))
    ).scalar_one()
    db_session.add(StaffMember(user_id=reader_id, role_id=reader_role.id, is_active=True))
    await db_session.commit()

    logs = (await client.get("/api/admin/audit-logs/?action=admin.access")).json()["items"]
    assert logs and logs[0]["actor_name"] == "Ada"
    assert logs[0]["actor_staff_id"] == ada_member_id


async def test_audit_log_list_and_filter(client, db_session):
    await make_staff(client, db_session)  # Superadmin
    # generate some auditable actions
    await client.get("/api/admin/me/")  # admin.access
    r = await client.post("/api/admin/roles/", json={"name": "Support", "privileges": []})
    role_id = r.json()["id"]
    await client.delete(f"/api/admin/roles/{role_id}/")

    all_logs = (await client.get("/api/admin/audit-logs/")).json()["items"]
    assert len(all_logs) >= 3
    # reverse-chron: newest first
    assert all_logs[0]["created_at"] >= all_logs[-1]["created_at"]
    # shape
    assert set(all_logs[0]) == {
        "id", "actor_staff_id", "actor_name", "action", "target_type",
        "target_id", "metadata", "ip_address", "created_at",
    }
    assert all_logs[0]["actor_name"] == "Ada"

    # filter by action
    only_create = (await client.get("/api/admin/audit-logs/?action=role.create")).json()["items"]
    assert only_create and all(x["action"] == "role.create" for x in only_create)


async def test_audit_log_requires_audit_read(client, db_session):
    await make_staff(client, db_session, is_system=False, privileges=["roles.read"])
    assert (await client.get("/api/admin/audit-logs/")).status_code == 403


async def test_audit_log_date_range_filter(client, db_session):
    from datetime import timedelta

    await make_staff(client, db_session)  # Superadmin
    await client.get("/api/admin/me/")  # emits admin.access

    logs = (await client.get("/api/admin/audit-logs/")).json()["items"]
    assert logs
    created_at = datetime.fromisoformat(logs[0]["created_at"])

    # a range that comfortably brackets "now" includes the row
    in_range = (await client.get(
        "/api/admin/audit-logs/",
        params={
            "created_from": (created_at - timedelta(hours=1)).isoformat(),
            "created_to": (created_at + timedelta(hours=1)).isoformat(),
        },
    )).json()["items"]
    assert any(x["action"] == "admin.access" for x in in_range)

    # a range entirely in the future excludes it
    out_of_range = (await client.get(
        "/api/admin/audit-logs/",
        params={"created_from": (created_at + timedelta(days=1)).isoformat()},
    )).json()["items"]
    assert not any(x["action"] == "admin.access" for x in out_of_range)
