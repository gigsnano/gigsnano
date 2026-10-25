from gigsnano_api.admin.deps import resolve_privileges
from gigsnano_api.admin.privileges import PRIVILEGE_KEYS
from gigsnano_api.models import StaffRole


def test_resolve_privileges_system_role_gets_all():
    role = StaffRole(name="Superadmin", privileges=[], is_system=True)
    assert resolve_privileges(role) == PRIVILEGE_KEYS


def test_resolve_privileges_normal_role():
    role = StaffRole(name="Support", privileges=["users.read", "audit.read"], is_system=False)
    assert resolve_privileges(role) == {"users.read", "audit.read"}


async def test_get_staff_context_403_for_non_staff(client, db_session):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Bob", "email": "bob@example.test", "password": "s3cret!"})
    res = await client.get("/api/admin/me/")
    assert res.status_code == 403


async def test_admin_me_401_without_auth(client, db_session):
    res = await client.get("/api/admin/me/")
    assert res.status_code == 401
