from gigsnano_api.models import AuditLog, StaffMember, StaffRole


def test_staff_models_columns():
    assert StaffRole.__tablename__ == "staff_roles"
    assert StaffMember.__tablename__ == "staff_members"
    assert AuditLog.__tablename__ == "audit_logs"
    # meta maps to the "metadata" column (metadata is reserved by SQLAlchemy)
    assert AuditLog.__table__.c.meta.name == "metadata"


def test_staff_role_defaults():
    role = StaffRole(name="Support", description="", privileges=["users.read"])
    assert role.is_system is None or role.is_system in (False, None)
    assert role.privileges == ["users.read"]
