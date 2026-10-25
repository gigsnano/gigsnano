import httpx

from gigsnano_api.app import create_app


async def test_healthz_returns_ok():
    app = create_app()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/healthz")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


async def test_health_returns_ok():
    # GIN-77: Azure's App Service health probe hits /health (not /healthz) and
    # was 404-ing in live. Both paths must answer 200.
    app = create_app()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
