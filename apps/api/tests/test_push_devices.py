import httpx
from sqlalchemy import select

from gigsnano_api.models import DeviceToken, DigestPreference

OWNER = {"display_name": "Owner", "email": "owner@example.test", "password": "s3cret!"}
OTHER = {"display_name": "Mia", "email": "mia@example.test", "password": "s3cret!"}
TOKEN = "ExponentPushToken[abc123]"


def _device(token: str = TOKEN, **extra) -> dict:
    return {"token": token, "platform": "ios", "device_name": "iPhone", **extra}


async def _signed_in(client) -> dict:
    return (await client.post("/api/auth/sign-up/", json=OWNER)).json()


def _other_client(app):
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


async def test_register_device(client):
    await _signed_in(client)
    res = await client.post("/api/me/devices/", json=_device())
    assert res.status_code == 201
    assert set(res.json()) == {"id", "platform", "device_name"}
    assert res.json()["platform"] == "ios"


async def test_token_moves_to_new_user_and_stays_single_row(app, client, db_session):
    first = await _signed_in(client)
    await client.post("/api/me/devices/", json=_device())
    async with _other_client(app) as other:
        second = (await other.post("/api/auth/sign-up/", json=OTHER)).json()
        res = await other.post(
            "/api/me/devices/", json=_device(device_name="Mia's phone") | {"platform": "android"}
        )
        assert res.status_code == 201

    rows = (await db_session.execute(select(DeviceToken))).scalars().all()
    assert len(rows) == 1
    assert rows[0].user_id == second["id"] != first["id"]
    assert (rows[0].platform, rows[0].device_name) == ("android", "Mia's phone")


async def test_bad_token_or_platform_422(client):
    await _signed_in(client)
    assert (await client.post("/api/me/devices/", json=_device("not-a-token"))).status_code == 422
    bad = _device() | {"platform": "windows"}
    assert (await client.post("/api/me/devices/", json=bad)).status_code == 422


async def test_delete_own_device_204_other_404(app, client):
    await _signed_in(client)
    mine = (await client.post("/api/me/devices/", json=_device())).json()
    async with _other_client(app) as other:
        await other.post("/api/auth/sign-up/", json=OTHER)
        assert (await other.delete(f"/api/me/devices/{mine['id']}/")).status_code == 404
    assert (await client.delete(f"/api/me/devices/{mine['id']}/")).status_code == 204
    assert (await client.delete(f"/api/me/devices/{mine['id']}/")).status_code == 404


async def test_preferences_default(client):
    await _signed_in(client)
    res = await client.get("/api/me/push-preferences/")
    assert res.status_code == 200
    assert res.json() == {"realtime": True, "briefing": False}


async def test_toggle_preferences_persist(client, db_session):
    user = await _signed_in(client)
    res = await client.patch("/api/me/push-preferences/", json={"realtime": False})
    assert res.json() == {"realtime": False, "briefing": False}

    res = await client.patch("/api/me/push-preferences/", json={"briefing": True})
    assert res.json() == {"realtime": False, "briefing": True}
    pref = (await db_session.execute(
        select(DigestPreference).where(DigestPreference.user_id == user["id"])
    )).scalar_one()
    assert pref.channels == ["email", "in_app", "push"]  # others undisturbed

    assert (await client.get("/api/me/push-preferences/")).json() == {
        "realtime": False, "briefing": True}
    res = await client.patch("/api/me/push-preferences/", json={"briefing": False})
    assert res.json() == {"realtime": False, "briefing": False}
    await db_session.refresh(pref)
    assert pref.channels == ["email", "in_app"]
