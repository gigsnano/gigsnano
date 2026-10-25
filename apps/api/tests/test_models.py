import pytest
from sqlalchemy.exc import IntegrityError

from gigsnano_api.auth.models import User
from gigsnano_api.models import (
    EMemberStatus,
    EWorkspaceRole,
    Workspace,
    WorkspaceMember,
)


def make_user(email: str = "ada@example.test") -> User:
    return User(email=email, display_name="Ada Lovelace", password_hash="x")


async def test_user_email_unique(db_session):
    db_session.add(make_user())
    await db_session.commit()
    db_session.add(make_user())
    with pytest.raises(IntegrityError):
        await db_session.commit()


async def test_member_defaults_and_unique_per_workspace(db_session):
    user = make_user()
    ws = Workspace(slug="acme", name="Acme")
    db_session.add_all([user, ws])
    await db_session.flush()

    member = WorkspaceMember(workspace_id=ws.id, user_id=user.id)
    db_session.add(member)
    await db_session.commit()

    assert member.role == EWorkspaceRole.MEMBER
    assert member.status == EMemberStatus.ACTIVE
    assert len(member.id) == 36  # uuid string pk

    db_session.add(WorkspaceMember(workspace_id=ws.id, user_id=user.id))
    with pytest.raises(IntegrityError):
        await db_session.commit()
