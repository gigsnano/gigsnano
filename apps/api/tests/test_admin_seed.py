from sqlalchemy import select

from gigsnano_api.admin import seed as seed_mod
from gigsnano_api.admin.seed import ensure_superadmin_role, seed_staff
from gigsnano_api.auth.models import User
from gigsnano_api.models import StaffMember, StaffRole


async def test_ensure_superadmin_role_idempotent(db_session):
    r1 = await ensure_superadmin_role(db_session)
    await db_session.commit()
    r2 = await ensure_superadmin_role(db_session)
    await db_session.commit()
    assert r1.id == r2.id and r1.is_system is True
    roles = (await db_session.execute(select(StaffRole))).scalars().all()
    assert len(roles) == 1


async def test_seed_grants_bootstrap_user(db_session, monkeypatch):
    db_session.add(User(id="u1", email="boss@acme.test", display_name="Boss"))
    await db_session.commit()
    monkeypatch.setattr(seed_mod, "bootstrap_emails", lambda: ["boss@acme.test"])

    await seed_staff(db_session)
    await seed_staff(db_session)  # second run must be a no-op

    members = (await db_session.execute(select(StaffMember))).scalars().all()
    assert len(members) == 1 and members[0].user_id == "u1" and members[0].is_active is True


async def test_seed_noop_when_no_match(db_session, monkeypatch):
    monkeypatch.setattr(seed_mod, "bootstrap_emails", lambda: ["nobody@acme.test"])
    await seed_staff(db_session)
    members = (await db_session.execute(select(StaffMember))).scalars().all()
    assert members == []
