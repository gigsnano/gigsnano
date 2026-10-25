from sqlalchemy import select

from gigsnano_api.auth.models import User
from gigsnano_api.core.security import verify_password
from gigsnano_api.email.provider import FakeEmailProvider
from gigsnano_api.email.tokens import make_email_token, pwh_fingerprint


async def test_forgot_sends_email_and_reset_changes_password(client, db_session):
    FakeEmailProvider.reset()
    await client.post(
        "/api/auth/sign-up/",
        json={"display_name": "Sam", "email": "sam@x.com", "password": "oldpass123"},
    )
    r = await client.post("/api/auth/forgot-password/", json={"email": "sam@x.com"})
    assert r.status_code == 200
    assert FakeEmailProvider.sent, "a reset email should have been queued"

    user = (
        await db_session.execute(select(User).where(User.email == "sam@x.com"))
    ).scalar_one()
    token = make_email_token(
        "reset",
        user.id,
        ttl_seconds=3600,
        fingerprint=pwh_fingerprint(user.password_hash),
    )
    r2 = await client.post(
        "/api/auth/reset-password/",
        json={"token": token, "new_password": "newpass456"},
    )
    assert r2.status_code == 200
    await db_session.refresh(user)
    assert verify_password("newpass456", user.password_hash)


async def test_forgot_unknown_email_still_200(client):
    FakeEmailProvider.reset()
    r = await client.post("/api/auth/forgot-password/", json={"email": "nobody@x.com"})
    assert r.status_code == 200
    assert FakeEmailProvider.sent == []


async def test_reset_token_reuse_rejected(client, db_session):
    await client.post(
        "/api/auth/sign-up/",
        json={"display_name": "T", "email": "t@x.com", "password": "oldpass123"},
    )
    user = (await db_session.execute(select(User).where(User.email == "t@x.com"))).scalar_one()
    token = make_email_token(
        "reset",
        user.id,
        ttl_seconds=3600,
        fingerprint=pwh_fingerprint(user.password_hash),
    )
    await client.post(
        "/api/auth/reset-password/",
        json={"token": token, "new_password": "newpass456"},
    )
    r = await client.post(
        "/api/auth/reset-password/",
        json={"token": token, "new_password": "third789"},
    )
    assert r.status_code == 400
