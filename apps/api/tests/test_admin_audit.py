from sqlalchemy import select

from gigsnano_api.admin.audit import record_audit
from gigsnano_api.admin.deps import StaffContext
from gigsnano_api.models import AuditLog, StaffMember, StaffRole


async def _staff_ctx(db):
    role = StaffRole(name="Superadmin", privileges=[], is_system=True)
    db.add(role)
    await db.flush()
    staff = StaffMember(user_id="u_test", role_id=role.id, is_active=True)
    db.add(staff)
    await db.flush()
    return StaffContext(
        user=None, staff=staff, role=role, privileges=set(),
        ip_address="1.2.3.4", user_agent="pytest",
    )


async def test_record_audit_inserts_row(db_session):
    ctx = await _staff_ctx(db_session)
    row = await record_audit(
        db_session, ctx, "role.update",
        target_type="staff_role", target_id="r1", meta={"before": {}, "after": {"name": "X"}},
    )
    await db_session.commit()
    assert row.action == "role.update"
    logs = (await db_session.execute(select(AuditLog))).scalars().all()
    assert len(logs) == 1
    assert logs[0].actor_staff_id == ctx.staff.id
    assert logs[0].ip_address == "1.2.3.4"
    assert logs[0].user_agent == "pytest"
    assert logs[0].meta == {"before": {}, "after": {"name": "X"}}
