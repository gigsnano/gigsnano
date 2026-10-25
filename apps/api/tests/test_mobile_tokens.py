from datetime import timedelta

import pytest
from sqlalchemy import select

from gigsnano_api.auth.mobile_tokens import (
    InvalidRefreshToken,
    issue_token_pair,
    revoke_refresh_family,
    rotate_refresh_token,
)
from gigsnano_api.core.db import utcnow
from gigsnano_api.core.security import decode_token
from gigsnano_api.models import MobileRefreshToken


async def _user(db_session, make_user, **kw):
    user = make_user(**kw)
    db_session.add(user)
    await db_session.commit()
    return user


async def test_issue_stores_only_the_hash(db_session, make_user):
    user = await _user(db_session, make_user)
    pair = await issue_token_pair(db_session, user.id, device_name="iPhone")
    await db_session.commit()

    assert pair.refresh_token.startswith("gnr_")
    assert decode_token(pair.access_token, "access") == user.id
    assert pair.expires_in == 15 * 60
    rows = (await db_session.execute(select(MobileRefreshToken))).scalars().all()
    assert len(rows) == 1
    assert rows[0].token_hash != pair.refresh_token
    assert rows[0].device_name == "iPhone"


async def test_rotate_returns_new_pair_and_revokes_old(db_session, make_user):
    user = await _user(db_session, make_user)
    first = await issue_token_pair(db_session, user.id)
    await db_session.commit()

    second = await rotate_refresh_token(db_session, first.refresh_token)

    assert second.refresh_token != first.refresh_token
    assert decode_token(second.access_token, "access") == user.id
    rows = (await db_session.execute(select(MobileRefreshToken))).scalars().all()
    assert len({r.family_id for r in rows}) == 1  # rotation stays in the family
    assert sum(r.revoked_at is None for r in rows) == 1


async def test_reused_refresh_token_revokes_family(db_session, make_user):
    user = await _user(db_session, make_user)
    first = await issue_token_pair(db_session, user.id)
    await db_session.commit()
    second = await rotate_refresh_token(db_session, first.refresh_token)

    with pytest.raises(InvalidRefreshToken):
        await rotate_refresh_token(db_session, first.refresh_token)  # replay
    with pytest.raises(InvalidRefreshToken):
        await rotate_refresh_token(db_session, second.refresh_token)  # family is dead


async def test_expired_refresh_token_rejected(db_session, make_user):
    user = await _user(db_session, make_user)
    pair = await issue_token_pair(db_session, user.id)
    row = (await db_session.execute(select(MobileRefreshToken))).scalar_one()
    row.expires_at = utcnow() - timedelta(seconds=1)
    await db_session.commit()

    with pytest.raises(InvalidRefreshToken):
        await rotate_refresh_token(db_session, pair.refresh_token)


async def test_unknown_refresh_token_rejected(db_session):
    with pytest.raises(InvalidRefreshToken):
        await rotate_refresh_token(db_session, "gnr_nope")


async def test_suspended_user_cannot_refresh(db_session, make_user):
    user = await _user(db_session, make_user)
    pair = await issue_token_pair(db_session, user.id)
    user.is_suspended = True
    await db_session.commit()

    with pytest.raises(InvalidRefreshToken):
        await rotate_refresh_token(db_session, pair.refresh_token)


async def test_revoke_family_ends_the_session(db_session, make_user):
    user = await _user(db_session, make_user)
    pair = await issue_token_pair(db_session, user.id)
    await db_session.commit()

    await revoke_refresh_family(db_session, pair.refresh_token)
    await revoke_refresh_family(db_session, "gnr_unknown")  # silent

    with pytest.raises(InvalidRefreshToken):
        await rotate_refresh_token(db_session, pair.refresh_token)


async def test_double_rotation_without_commit_revokes_family(db_session, make_user):
    user = await _user(db_session, make_user)
    first = await issue_token_pair(db_session, user.id)
    await db_session.commit()

    second = await rotate_refresh_token(db_session, first.refresh_token)
    with pytest.raises(InvalidRefreshToken):
        await rotate_refresh_token(db_session, first.refresh_token)

    rows = (await db_session.execute(select(MobileRefreshToken))).scalars().all()
    assert all(r.revoked_at is not None for r in rows)
    with pytest.raises(InvalidRefreshToken):
        await rotate_refresh_token(db_session, second.refresh_token)
