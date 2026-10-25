"""GIN-22 code-review fixes: viewer-write gating on BMAD chat + agent-delegation
write routes (C1/I4), and that the rate-limit key ignores a spoofed
X-Forwarded-For header (C2)."""
import httpx

from gigsnano_api.bmad.provider import FakeProvider
from tests.helpers import by_workflow, sprint_zero

SIGNUP_ADA = {
    "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
}
SIGNUP_ALAN = {
    "display_name": "Alan Turing", "email": "alan@example.test", "password": "s3cret!",
}
CREATE_PROJECT = {
    "name": "Mobile App", "identifier": "MBA", "flow": "fresh", "has_ui": False,
    "cover_image_url": "https://img.test/c.jpg",
}


async def _sign_in(client, email: str, password: str = "s3cret!"):
    await client.post("/api/auth/sign-out/")
    res = await client.post("/api/auth/sign-in/", json={"email": email, "password": password})
    assert res.status_code == 200


async def _setup_project_with_alan(client, role: str) -> dict:
    """Ada owns workspace 'acme' + project 'MBA'; Alan is added to the project
    with `role` ('viewer' or 'member'). Ada stays signed in on return."""
    await client.post("/api/auth/sign-up/", json=SIGNUP_ALAN)
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-up/", json=SIGNUP_ADA)
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    alan_ws = (
        await client.post("/api/workspaces/acme/members/", json={"email": "alan@example.test"})
    ).json()
    await _sign_in(client, "alan@example.test")
    await client.patch(f"/api/workspaces/acme/members/{alan_ws['id']}/", json={"accept": True})
    await _sign_in(client, "ada@example.test")
    project = (
        await client.post("/api/workspaces/acme/projects/", json=CREATE_PROJECT)
    ).json()
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/members/",
        json={"user_id": alan_ws["user_id"], "role": role},
    )
    assert res.status_code == 201
    return project


async def _unlocked_prd_with_open_thread(client, project_id: str) -> dict:
    """As Ada (Owner), unlock the PRD card and open its thread so a later
    finalize-description call from Alan only exercises the viewer guard."""
    stories = await sprint_zero(client, project_id)
    track = by_workflow(stories, "track-selection")
    await client.patch(
        f"/api/workspaces/acme/projects/{project_id}/stories/{track['id']}/",
        json={"status": "done"},
    )
    prd = by_workflow(await sprint_zero(client, project_id), "bmad-prd")
    await client.post(
        f"/api/workspaces/acme/projects/{project_id}/stories/{prd['id']}/thread/"
    )
    return prd


async def test_viewer_403_on_finalize_description(app, client):
    app.state.llm_provider = FakeProvider()
    project = await _setup_project_with_alan(client, "viewer")
    prd = await _unlocked_prd_with_open_thread(client, project["id"])

    await _sign_in(client, "alan@example.test")
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{prd['id']}"
        "/thread/finalize-description/"
    )
    assert res.status_code == 403


async def test_member_succeeds_on_finalize_description(app, client):
    """Regression guard: the Viewer guard doesn't clip a real project Member."""
    app.state.llm_provider = FakeProvider()
    project = await _setup_project_with_alan(client, "member")
    prd = await _unlocked_prd_with_open_thread(client, project["id"])

    await _sign_in(client, "alan@example.test")
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{prd['id']}"
        "/thread/finalize-description/"
    )
    assert res.status_code == 200


async def _connect_cursor(client, monkeypatch, *, email: str):
    async def _fake_verify(_key: str):
        return {"email": email}

    monkeypatch.setattr(
        "gigsnano_api.agent_delegation.router.verify_cursor_api_key",
        _fake_verify,
    )
    res = await client.post(
        "/api/agents/connections/cursor/connect/",
        json={"api_key": "cursor_test_key"},
    )
    assert res.status_code == 200
    return res.json()["id"]


async def test_viewer_403_on_dispatch_delegation(client, monkeypatch):
    project = await _setup_project_with_alan(client, "viewer")
    stories = await sprint_zero(client, project["id"])
    story_id = stories[0]["id"]

    await _sign_in(client, "alan@example.test")
    conn_id = await _connect_cursor(client, monkeypatch, email="alan@example.test")
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story_id}/delegations/",
        json={"unit_type": "work_item", "unit_id": story_id, "connection_id": conn_id},
    )
    assert res.status_code == 403


async def test_member_succeeds_on_dispatch_delegation(client, monkeypatch):
    from gigsnano_api.agent_delegation import router as agent_router
    from gigsnano_api.agent_delegation.provider import FakeAgentProvider

    monkeypatch.setattr(
        agent_router, "resolve_agent_provider", lambda *a, **k: FakeAgentProvider()
    )
    project = await _setup_project_with_alan(client, "member")
    stories = await sprint_zero(client, project["id"])
    story_id = stories[0]["id"]

    await _sign_in(client, "alan@example.test")
    conn_id = await _connect_cursor(client, monkeypatch, email="alan@example.test")
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story_id}/delegations/",
        json={"unit_type": "work_item", "unit_id": story_id, "connection_id": conn_id},
    )
    assert res.status_code == 200


BAD_CREDS = {"email": "nobody@example.test", "password": "wrong"}


def _client_at(app, ip: str, *, spoof_ip: str | None = None) -> httpx.AsyncClient:
    transport = httpx.ASGITransport(app=app, client=(ip, 12345))
    headers = {"X-Forwarded-For": spoof_ip} if spoof_ip else {}
    return httpx.AsyncClient(transport=transport, base_url="http://test", headers=headers)


async def test_rate_limit_key_ignores_spoofed_forwarded_for_header(app):
    """C2 regression: previously the limiter keyed off get_ipaddr, which reads
    X-Forwarded-For — a client could send a fresh value on every request and
    dodge the bucket entirely. get_remote_address keys strictly off
    request.client.host, so the spoofed header must NOT grant a fresh bucket."""
    real_ip = "10.0.0.9"
    async with _client_at(app, real_ip, spoof_ip="10.0.0.100") as c:
        for _ in range(5):
            res = await c.post("/api/auth/sign-in/", json=BAD_CREDS)
            assert res.status_code == 401

        # Same real IP, a brand-new spoofed X-Forwarded-For each time — must
        # still trip the limit since the header is never consulted.
        res = await c.post(
            "/api/auth/sign-in/",
            json=BAD_CREDS,
            headers={"X-Forwarded-For": "10.0.0.200"},
        )
        assert res.status_code == 429
