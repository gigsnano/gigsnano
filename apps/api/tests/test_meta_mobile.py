from gigsnano_api.core.config import settings


async def test_meta_mobile_is_public_and_configurable(client, monkeypatch):
    monkeypatch.setattr(settings, "mobile_min_version", "1.2.0")
    res = await client.get("/api/meta/mobile/")
    assert res.status_code == 200
    assert res.json() == {"min_version": "1.2.0"}
