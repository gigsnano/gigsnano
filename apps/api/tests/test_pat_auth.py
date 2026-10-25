from datetime import datetime, timezone

from sqlalchemy import select

from gigsnano_api.auth.models import User
from gigsnano_api.models.tokens import PersonalAccessToken, generate_token


async def _signup(client):
    await client.post(
        "/api/auth/sign-up/",
        json={"display_name": "Ada", "email": "ada@example.test", "password": "s3cret!"},
    )


async def test_bearer_pat_authenticates(client, db_session):
    await _signup(client)
    user = (await db_session.execute(select(User))).scalar_one()
    plaintext, digest = generate_token()
    db_session.add(PersonalAccessToken(user_id=user.id, name="cli", token_hash=digest))
    await db_session.commit()
    client.cookies.clear()  # no cookie — Bearer only
    res = await client.get("/api/auth/me/", headers={"Authorization": f"Bearer {plaintext}"})
    assert res.status_code == 200
    assert res.json()["email"] == "ada@example.test"


async def test_bearer_pat_persists_last_used_at(client, db_session):
    await _signup(client)
    user = (await db_session.execute(select(User))).scalar_one()
    plaintext, digest = generate_token()
    pat = PersonalAccessToken(user_id=user.id, name="cli", token_hash=digest)
    db_session.add(pat)
    await db_session.commit()
    assert pat.last_used_at is None
    client.cookies.clear()  # no cookie — Bearer only
    res = await client.get("/api/auth/me/", headers={"Authorization": f"Bearer {plaintext}"})
    assert res.status_code == 200
    # `db_session`'s identity map already holds `pat` (added+committed above) with
    # expire_on_commit=False, so a plain re-select would just hand back the same
    # cached Python object -- force an actual re-read from the DB.
    refreshed = (
        await db_session.execute(
            select(PersonalAccessToken)
            .where(PersonalAccessToken.id == pat.id)
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    assert refreshed.last_used_at is not None


async def test_unknown_bearer_token_rejected(client):
    client.cookies.clear()  # no cookie — Bearer only
    res = await client.get(
        "/api/auth/me/", headers={"Authorization": "Bearer gnp_doesnotexist"}
    )
    assert res.status_code == 401


async def test_revoked_pat_rejected(client, db_session):
    await _signup(client)
    user = (await db_session.execute(select(User))).scalar_one()
    plaintext, digest = generate_token()
    db_session.add(
        PersonalAccessToken(
            user_id=user.id,
            name="cli",
            token_hash=digest,
            revoked_at=datetime.now(timezone.utc),
        )
    )
    await db_session.commit()
    client.cookies.clear()
    res = await client.get("/api/auth/me/", headers={"Authorization": f"Bearer {plaintext}"})
    assert res.status_code == 401
