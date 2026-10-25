"""GIN-22 Part A: sign-in is brute-forceable without a per-IP rate limit."""

import httpx

BAD_CREDS = {"email": "nobody@example.test", "password": "wrong"}


def _client_at(app, ip: str) -> httpx.AsyncClient:
    transport = httpx.ASGITransport(app=app, client=(ip, 12345))
    return httpx.AsyncClient(transport=transport, base_url="http://test")


async def test_sign_in_returns_429_after_limit_exceeded(app):
    async with _client_at(app, "10.0.0.1") as c:
        for _ in range(5):
            res = await c.post("/api/auth/sign-in/", json=BAD_CREDS)
            assert res.status_code == 401

        res = await c.post("/api/auth/sign-in/", json=BAD_CREDS)
        assert res.status_code == 429
        assert "Retry-After" in res.headers
        assert res.json()["detail"]


async def test_sign_in_rate_limit_is_keyed_per_caller_not_global(app):
    async with _client_at(app, "10.0.0.2") as attacker:
        for _ in range(6):
            await attacker.post("/api/auth/sign-in/", json=BAD_CREDS)
        exhausted = await attacker.post("/api/auth/sign-in/", json=BAD_CREDS)
        assert exhausted.status_code == 429

    # A different IP has its own, untouched bucket.
    async with _client_at(app, "10.0.0.3") as other:
        res = await other.post("/api/auth/sign-in/", json=BAD_CREDS)
        assert res.status_code == 401


async def test_legitimate_low_frequency_sign_in_is_never_throttled(app):
    async with _client_at(app, "10.0.0.4") as c:
        signup = await c.post(
            "/api/auth/sign-up/",
            json={
                "display_name": "Grace Hopper",
                "email": "grace@example.test",
                "password": "s3cret!",
            },
        )
        assert signup.status_code == 201

        res = await c.post(
            "/api/auth/sign-in/",
            json={"email": "grace@example.test", "password": "s3cret!"},
        )
        assert res.status_code == 200


async def test_forgot_password_rate_limited_per_ip_and_email(app):
    payload = {"email": "victim@example.test"}
    async with _client_at(app, "10.0.0.5") as c:
        for _ in range(3):
            res = await c.post("/api/auth/forgot-password/", json=payload)
            assert res.status_code == 200
        res = await c.post("/api/auth/forgot-password/", json=payload)
        assert res.status_code == 429
