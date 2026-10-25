from tests.helpers import make_staff


async def test_get_and_set_platform_fee(client, db_session):
    await make_staff(client, db_session)
    r = await client.get("/api/admin/billing/platform-fee/")
    assert r.json()["platform_fee_bps"] == 2000

    r2 = await client.put("/api/admin/billing/platform-fee/",
                          json={"platform_fee_bps": 1500})
    assert r2.status_code == 200

    r3 = await client.get("/api/admin/billing/platform-fee/")
    assert r3.json()["platform_fee_bps"] == 1500


async def test_non_staff_cannot_set_fee(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": "ada@example.test", "password": "s3cret!"})
    r = await client.put("/api/admin/billing/platform-fee/",
                         json={"platform_fee_bps": 1500})
    assert r.status_code in (401, 403)
