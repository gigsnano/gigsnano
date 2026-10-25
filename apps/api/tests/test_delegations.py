import json

import pytest


async def _project_and_story(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    project = (await client.post("/api/workspaces/acme/projects/", json={
        "name": "App", "identifier": "APP", "flow": "fresh",
        "cover_image_url": "https://img.test/c.jpg",
    })).json()
    stories = (await client.get(
        f"/api/workspaces/acme/projects/{project['id']}/sprint-zero/stories/"
    )).json()
    return project["id"], stories[0]["id"]


async def _connect_cursor(client, monkeypatch):
    async def _fake_verify(_key: str):
        return {"email": "ada@example.test"}

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


@pytest.mark.asyncio
async def test_dispatch_then_stream_completes_with_pr(client, monkeypatch):
    from gigsnano_api.agent_delegation import router as agent_router
    from gigsnano_api.agent_delegation.provider import FakeAgentProvider

    monkeypatch.setattr(
        agent_router, "resolve_agent_provider", lambda *a, **k: FakeAgentProvider()
    )
    project_id, story_id = await _project_and_story(client)
    conn_id = await _connect_cursor(client, monkeypatch)
    base = f"/api/workspaces/acme/projects/{project_id}"

    created = await client.post(
        f"{base}/stories/{story_id}/delegations/",
        json={"unit_type": "work_item", "unit_id": story_id, "connection_id": conn_id},
    )
    assert created.status_code == 200
    d = created.json()
    assert d["status"] == "queued"
    assert d["workspace_slug"] == "acme"

    statuses = []
    async with client.stream("GET", f"{base}/delegations/{d['id']}/stream/") as res:
        assert res.status_code == 200
        async for line in res.aiter_lines():
            if line.startswith("data: ") and line != "data: [DONE]":
                statuses.append(json.loads(line[len("data: "):])["status"])
    assert statuses[0] == "queued"
    assert statuses[-1] == "completed"

    # After the stream, the row is terminal with a PR result.
    got = (await client.get(f"{base}/delegations/{d['id']}/")).json()
    assert got["status"] == "completed"
    assert got["result"]["kind"] == "pr"


@pytest.mark.asyncio
async def test_cancel_before_stream(client, monkeypatch):
    from gigsnano_api.agent_delegation import router as agent_router
    from gigsnano_api.agent_delegation.provider import FakeAgentProvider

    monkeypatch.setattr(
        agent_router, "resolve_agent_provider", lambda *a, **k: FakeAgentProvider()
    )
    project_id, story_id = await _project_and_story(client)
    conn_id = await _connect_cursor(client, monkeypatch)
    base = f"/api/workspaces/acme/projects/{project_id}"
    d = (await client.post(
        f"{base}/stories/{story_id}/delegations/",
        json={"unit_type": "bmad_card", "unit_id": story_id, "connection_id": conn_id},
    )).json()
    c = await client.post(f"{base}/delegations/{d['id']}/cancel/")
    assert c.status_code == 200
    assert c.json()["status"] == "cancelled"


@pytest.mark.asyncio
async def test_cancel_mid_stream_is_not_overwritten(client, app, monkeypatch):
    """Regression for I1: a cancel issued while the SSE stream is paused mid-`follow()`
    must stick — the stream's next commit must not resurrect the row to completed.

    Uses a controllable fake provider gated by an asyncio.Event instead of racing real
    sleeps, so the interleaving (cancel lands strictly between the "queued" and
    "completed" events) is deterministic rather than timing-dependent."""
    import asyncio

    from gigsnano_api.agent_delegation import router as agent_router
    from gigsnano_api.agent_delegation.provider import DelegationEvent, StartResult
    from gigsnano_api.models import EDelegationStatus

    paused = asyncio.Event()
    resume = asyncio.Event()

    class ControlledProvider:
        async def start(self, token, ctx):
            return StartResult(external_ref=None)

        async def follow(self, ctx, external_ref):
            yield DelegationEvent(EDelegationStatus.QUEUED, "Queued")
            paused.set()
            await resume.wait()
            yield DelegationEvent(
                EDelegationStatus.COMPLETED, "Ready",
                result={"kind": "document", "document_id": "", "summary": "Draft ready."},
            )

    controlled = ControlledProvider()
    monkeypatch.setattr(agent_router, "resolve_agent_provider", lambda *a, **k: controlled)

    project_id, story_id = await _project_and_story(client)
    conn_id = await _connect_cursor(client, monkeypatch)
    base = f"/api/workspaces/acme/projects/{project_id}"

    d = (await client.post(
        f"{base}/stories/{story_id}/delegations/",
        json={"unit_type": "bmad_card", "unit_id": story_id, "connection_id": conn_id},
    )).json()

    statuses = []

    async def _consume():
        async with client.stream("GET", f"{base}/delegations/{d['id']}/stream/") as res:
            assert res.status_code == 200
            async for line in res.aiter_lines():
                if line.startswith("data: ") and line != "data: [DONE]":
                    statuses.append(json.loads(line[len("data: "):])["status"])

    consume_task = asyncio.create_task(_consume())
    # Deterministically wait for follow() to be paused between events (not a
    # timing race — an explicit signal from the generator itself).
    await asyncio.wait_for(paused.wait(), timeout=5)

    cancel_res = await client.post(f"{base}/delegations/{d['id']}/cancel/")
    assert cancel_res.status_code == 200
    assert cancel_res.json()["status"] == "cancelled"

    resume.set()
    await asyncio.wait_for(consume_task, timeout=5)

    assert "completed" not in statuses
    assert statuses == ["queued", "cancelled"]

    got = (await client.get(f"{base}/delegations/{d['id']}/")).json()
    assert got["status"] == "cancelled"


@pytest.mark.asyncio
async def test_dispatch_rejects_foreign_connection(client, app, monkeypatch):
    import httpx
    project_id, story_id = await _project_and_story(client)
    base = f"/api/workspaces/acme/projects/{project_id}"

    async def _fake_verify(_key: str):
        return {"email": "bo@example.test"}

    monkeypatch.setattr(
        "gigsnano_api.agent_delegation.router.verify_cursor_api_key",
        _fake_verify,
    )
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as other:
        await other.post("/api/auth/sign-up/", json={
            "display_name": "Bo", "email": "bo@example.test", "password": "s3cret!",
        })
        foreign_id = (
            await other.post(
                "/api/agents/connections/cursor/connect/",
                json={"api_key": "cursor_test_key"},
            )
        ).json()["id"]

    res = await client.post(
        f"{base}/stories/{story_id}/delegations/",
        json={"unit_type": "work_item", "unit_id": story_id, "connection_id": foreign_id},
    )
    assert res.status_code == 404
