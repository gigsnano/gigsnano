from sqlalchemy import select

from gigsnano_api.auth.models import User
from gigsnano_api.core.security import hash_password


async def test_sign_in_rejects_suspended_user(client, db_session):
    user = User(
        email="suspended@test.io",
        display_name="Suspended User",
        password_hash=hash_password("s3cret!"),
        is_suspended=True,
    )
    db_session.add(user)
    await db_session.commit()

    res = await client.post(
        "/api/auth/sign-in/",
        json={"email": "suspended@test.io", "password": "s3cret!"},
    )
    assert res.status_code == 403
    assert "suspended" in res.json()["detail"].lower()


async def test_me_rejects_suspended_user(client, db_session):
    signup = {
        "display_name": "Ada Lovelace",
        "email": "ada@example.test",
        "password": "s3cret!",
    }
    await client.post("/api/auth/sign-up/", json=signup)

    result = await db_session.execute(select(User).where(User.email == "ada@example.test"))
    user = result.scalar_one()
    user.is_suspended = True
    await db_session.commit()

    res = await client.get("/api/auth/me/")
    assert res.status_code == 403
    assert "suspended" in res.json()["detail"].lower()


async def test_refresh_rejects_suspended_user(client, db_session):
    signup = {
        "display_name": "Ada Lovelace",
        "email": "refresh@test.io",
        "password": "s3cret!",
    }
    await client.post("/api/auth/sign-up/", json=signup)

    result = await db_session.execute(select(User).where(User.email == "refresh@test.io"))
    user = result.scalar_one()
    user.is_suspended = True
    await db_session.commit()

    res = await client.post("/api/auth/refresh/")
    assert res.status_code == 403
    assert "suspended" in res.json()["detail"].lower()
