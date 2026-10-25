import base64

from gigsnano_api.bmad.provider import FakeProvider
from tests.fixtures.pdf_samples import SAMPLE_PDF
from tests.pagination_helpers import page_items


async def setup_ws(client):
    await client.post(
        "/api/auth/sign-up/",
        json={
            "display_name": "Grace Hopper",
            "email": "grace@example.test",
            "password": "s3cret!",
        },
    )
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})


async def test_thread_crud(client):
    await setup_ws(client)
    base = "/api/workspaces/acme/gigs-ai/threads/"

    res = await client.post(base, json={})
    assert res.status_code == 201
    thread = res.json()
    assert set(thread) == {
        "id",
        "workspace_slug",
        "project_id",
        "title",
        "model",
        "messages",
        "created_at",
        "updated_at",
    }
    assert thread["title"] == "New chat" and thread["model"] == "sonnet-5"
    assert thread["project_id"] is None and thread["messages"] == []
    tid = thread["id"]

    listed = page_items((await client.get(base)).json())
    assert [t["id"] for t in listed] == [tid]

    got = (await client.get(f"{base}{tid}/")).json()
    assert got["id"] == tid

    patched = (
        await client.patch(f"{base}{tid}/", json={"title": "Sprint ideas", "model": "sonnet-5"})
    ).json()
    assert patched["title"] == "Sprint ideas" and patched["model"] == "sonnet-5"

    res = await client.delete(f"{base}{tid}/")
    assert res.status_code == 200 and res.json() == {"success": True}
    assert page_items((await client.get(base)).json()) == []


async def test_thread_create_bad_model_422(client):
    await setup_ws(client)
    res = await client.post("/api/workspaces/acme/gigs-ai/threads/", json={"model": "gpt"})
    assert res.status_code == 422


async def test_thread_tenant_isolation(client):
    await setup_ws(client)
    tid = (await client.post("/api/workspaces/acme/gigs-ai/threads/", json={})).json()["id"]
    # a second workspace cannot see the first's thread
    await client.post("/api/workspaces/", json={"name": "Beta", "slug": "beta"})
    assert (await client.get(f"/api/workspaces/beta/gigs-ai/threads/{tid}/")).status_code == 404
    assert page_items((await client.get("/api/workspaces/beta/gigs-ai/threads/")).json()) == []


async def test_thread_requires_auth(client):
    res = await client.get("/api/workspaces/acme/gigs-ai/threads/")
    assert res.status_code in (401, 403, 404)


async def _read_sse(response) -> tuple[list[dict], str]:
    """Collect SSE events + the concatenated text-delta stream."""
    events, text = [], ""
    async for line in response.aiter_lines():
        if not line.startswith("data:"):
            continue
        payload = line[len("data:") :].strip()
        if payload == "[DONE]":
            events.append({"type": "[DONE]"})
            continue
        import json

        ev = json.loads(payload)
        events.append(ev)
        if ev.get("type") == "text-delta":
            text += ev["delta"]
    return events, text


async def test_send_message_streams_and_persists(app, client):
    app.state.llm_provider = FakeProvider(rounds=[{"text": "Here is a plan."}])
    await setup_ws(client)
    tid = (await client.post("/api/workspaces/acme/gigs-ai/threads/", json={})).json()["id"]

    async with client.stream(
        "POST",
        f"/api/workspaces/acme/gigs-ai/threads/{tid}/messages/",
        json={"content": "Plan my sprint"},
    ) as res:
        assert res.status_code == 200
        assert res.headers["x-vercel-ai-ui-message-stream"] == "v1"
        events, text = await _read_sse(res)

    types = [e["type"] for e in events]
    assert types[0] == "start" and "text-delta" in types
    assert types[-2:] == ["finish", "[DONE]"]
    assert text == "Here is a plan."

    # persisted: user + assistant; title set from the first user message
    thread = (await client.get(f"/api/workspaces/acme/gigs-ai/threads/{tid}/")).json()
    roles = [m["role"] for m in thread["messages"]]
    assert roles == ["user", "assistant"]
    assert thread["messages"][1]["content"] == "Here is a plan."
    assert thread["title"] == "Plan my sprint"


async def test_multi_turn_context_is_rebuilt(app, client):
    # The provider records the messages it receives so we can assert full history.
    class RecordingProvider(FakeProvider):
        def __init__(self):
            super().__init__(rounds=[{"text": "one"}, {"text": "two"}])
            self.seen: list[list[dict]] = []

        async def stream_round(self, *, system, messages, tools, model=None):
            self.seen.append(list(messages))
            async for ev in super().stream_round(
                system=system, messages=messages, tools=tools, model=model
            ):
                yield ev

    provider = RecordingProvider()
    app.state.llm_provider = provider
    await setup_ws(client)
    tid = (await client.post("/api/workspaces/acme/gigs-ai/threads/", json={})).json()["id"]
    url = f"/api/workspaces/acme/gigs-ai/threads/{tid}/messages/"

    async with client.stream("POST", url, json={"content": "first"}) as res:
        await _read_sse(res)
    async with client.stream("POST", url, json={"content": "second"}) as res:
        await _read_sse(res)

    # Second turn's messages must include the full prior history (user/assistant/user).
    assert provider.seen[1] == [
        {"role": "user", "content": "first"},
        {"role": "assistant", "content": "one"},
        {"role": "user", "content": "second"},
    ]


async def test_send_message_includes_attachments_and_agent_in_system(app, client):
    class RecordingProvider(FakeProvider):
        def __init__(self):
            super().__init__(rounds=[{"text": "ack"}])
            self.systems: list[list[dict]] = []

        async def stream_round(self, *, system, messages, tools, model=None):
            self.systems.append(list(system))
            async for ev in super().stream_round(
                system=system, messages=messages, tools=tools, model=model
            ):
                yield ev

    provider = RecordingProvider()
    app.state.llm_provider = provider
    await setup_ws(client)
    tid = (await client.post("/api/workspaces/acme/gigs-ai/threads/", json={})).json()["id"]

    async with client.stream(
        "POST",
        f"/api/workspaces/acme/gigs-ai/threads/{tid}/messages/",
        json={
            "content": "Review the requirements",
            "agent_id": "agent_analyst",
            "attachments": [
                {
                    "title": "Requirements",
                    "file_name": "requirements.md",
                    "mime_type": "text/markdown",
                    "content": "# Must support file uploads",
                }
            ],
        },
    ) as res:
        assert res.status_code == 200
        await _read_sse(res)

    system_text = "\n".join(block["text"] for block in provider.systems[0])
    assert "Analyst" in system_text
    assert "Must support file uploads" in system_text


async def test_send_message_extracts_pdf_attachment_into_system(app, client):
    class RecordingProvider(FakeProvider):
        def __init__(self):
            super().__init__(rounds=[{"text": "ack"}])
            self.systems: list[list[dict]] = []

        async def stream_round(self, *, system, messages, tools, model=None):
            self.systems.append(list(system))
            async for ev in super().stream_round(
                system=system, messages=messages, tools=tools, model=model
            ):
                yield ev

    provider = RecordingProvider()
    app.state.llm_provider = provider
    await setup_ws(client)
    tid = (await client.post("/api/workspaces/acme/gigs-ai/threads/", json={})).json()["id"]
    encoded = base64.b64encode(SAMPLE_PDF).decode("ascii")

    async with client.stream(
        "POST",
        f"/api/workspaces/acme/gigs-ai/threads/{tid}/messages/",
        json={
            "content": "Review the requirements",
            "agent_id": "agent_analyst",
            "attachments": [
                {
                    "title": "Requirements",
                    "file_name": "requirements.pdf",
                    "mime_type": "application/pdf",
                    "content": f"data:application/pdf;base64,{encoded}",
                }
            ],
        },
    ) as res:
        assert res.status_code == 200
        await _read_sse(res)

    system_text = "\n".join(block["text"] for block in provider.systems[0])
    assert "requirements" in system_text.lower() or "hello" in system_text.lower()


async def test_send_message_includes_project_work_items_in_system(app, client):
    """GIN-83: a project-scoped thread must put the project's actual work items
    (not just counts) into the model's system prompt, so GigsAI answers with
    real context. Creating a project seeds Sprint-0 stories, so the list is
    non-empty."""

    class RecordingProvider(FakeProvider):
        def __init__(self):
            super().__init__(rounds=[{"text": "ack"}])
            self.systems: list[list[dict]] = []

        async def stream_round(self, *, system, messages, tools, model=None):
            self.systems.append(list(system))
            async for ev in super().stream_round(
                system=system, messages=messages, tools=tools, model=model
            ):
                yield ev

    provider = RecordingProvider()
    app.state.llm_provider = provider
    await setup_ws(client)
    project = (
        await client.post(
            "/api/workspaces/acme/projects/",
            json={
                "name": "Mobile App",
                "identifier": "MBA",
                "flow": "fresh",
                "cover_image_url": "https://img.test/c.jpg",
            },
        )
    ).json()
    tid = (
        await client.post(
            "/api/workspaces/acme/gigs-ai/threads/", json={"project_id": project["id"]}
        )
    ).json()["id"]

    async with client.stream(
        "POST",
        f"/api/workspaces/acme/gigs-ai/threads/{tid}/messages/",
        json={"content": "What should I work on?"},
    ) as res:
        assert res.status_code == 200
        await _read_sse(res)

    system_text = "\n".join(block["text"] for block in provider.systems[0])
    assert "Project: Mobile App" in system_text
    assert "Work items:" in system_text
    assert "MBA-" in system_text  # a real work-item code from the Sprint-0 seed


async def test_send_message_thread_scoped(app, client):
    app.state.llm_provider = FakeProvider(turns=[("x", False)])
    await setup_ws(client)
    await client.post("/api/workspaces/", json={"name": "Beta", "slug": "beta"})
    tid = (await client.post("/api/workspaces/acme/gigs-ai/threads/", json={})).json()["id"]
    res = await client.post(
        f"/api/workspaces/beta/gigs-ai/threads/{tid}/messages/", json={"content": "hi"}
    )
    assert res.status_code == 404
