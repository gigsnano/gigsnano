from gigsnano_api.email.provider import FakeEmailProvider


async def test_invite_by_email_sends_message(client):
    FakeEmailProvider.reset()
    await client.post(
        "/api/auth/sign-up/",
        json={"display_name": "Owner", "email": "owner@test.com", "password": "s3cret!!"},
    )
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    r = await client.post(
        "/api/workspaces/acme/members/",
        json={"email": "newperson@x.com", "role": "member"},
    )
    assert r.status_code == 201
    assert any(m["to"] == "newperson@x.com" for m in FakeEmailProvider.sent)
