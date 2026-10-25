from sqlalchemy import select

from gigsnano_api.auth.models import User
from gigsnano_api.email.tokens import make_email_token


async def test_unsubscribe_flips_digest(client, db_session):
    await client.post(
        "/api/auth/sign-up/",
        json={"display_name": "U", "email": "u@x.com", "password": "s3cret!!"},
    )
    user = (await db_session.execute(select(User).where(User.email == "u@x.com"))).scalar_one()
    user.email_digest = True
    await db_session.commit()
    token = make_email_token("unsub", user.id, ttl_seconds=31536000)
    r = await client.get(f"/api/email/unsubscribe/{token}/")
    assert r.status_code == 200
    await db_session.refresh(user)
    assert user.email_digest is False
