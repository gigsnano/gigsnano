from sqlalchemy import select

from gigsnano_api.auth.models import User
from gigsnano_api.email.provider import FakeEmailProvider
from gigsnano_api.email.tokens import make_email_token


async def test_request_then_confirm_sets_verified(client, db_session):
    FakeEmailProvider.reset()
    await client.post(
        "/api/auth/sign-up/",
        json={"display_name": "V", "email": "v@x.com", "password": "s3cret!!"},
    )
    r = await client.post("/api/auth/verify-email/request/")
    assert r.status_code == 200
    assert FakeEmailProvider.sent

    user = (await db_session.execute(select(User).where(User.email == "v@x.com"))).scalar_one()
    token = make_email_token("verify", user.id, ttl_seconds=86400)
    r2 = await client.post("/api/auth/verify-email/confirm/", json={"token": token})
    assert r2.status_code == 200
    await db_session.refresh(user)
    assert user.email_verified is True
