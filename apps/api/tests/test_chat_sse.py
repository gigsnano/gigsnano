import json

from gigsnano_api.bmad.provider import FakeProvider

CREATE_PROJECT = {
    "name": "Mobile App", "identifier": "MBA", "flow": "fresh",
    "cover_image_url": "https://img.test/c.jpg",
}


async def open_prd_thread(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    project = (
        await client.post("/api/workspaces/acme/projects/", json=CREATE_PROJECT)
    ).json()
    stories = (
        await client.get(
            f"/api/workspaces/acme/projects/{project['id']}/sprint-zero/stories/"
        )
    ).json()
    track = next(s for s in stories if s["bmad"]["workflow"] == "track-selection")
    await client.patch(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{track['id']}/",
        json={"status": "done"},
    )
    prd = next(s for s in stories if s["bmad"]["workflow"] == "bmad-prd")
    base = f"/api/workspaces/acme/projects/{project['id']}/stories/{prd['id']}"
    await client.post(f"{base}/thread/")
    return base


async def stream_events(client, url, content):
    events = []
    async with client.stream("POST", url, json={"content": content}) as res:
        assert res.status_code == 200
        assert res.headers["x-vercel-ai-ui-message-stream"] == "v1"
        async for line in res.aiter_lines():
            if line.startswith("data: ") and line != "data: [DONE]":
                events.append(json.loads(line[len("data: "):]))
    return events


async def test_turn_streams_and_persists(app, client):
    app.state.llm_provider = FakeProvider(turns=[("Let us define the PRD.", False)])
    base = await open_prd_thread(client)
    events = await stream_events(client, f"{base}/thread/messages/", "Start the PRD")

    types = [e["type"] for e in events]
    assert types[0] == "start"
    assert "text-start" in types and "text-end" in types and types[-1] == "finish"
    text = "".join(e["delta"] for e in events if e["type"] == "text-delta")
    assert text == "Let us define the PRD."

    thread = (await client.get(f"{base}/thread/")).json()
    assert [m["role"] for m in thread["messages"]] == ["user", "assistant"]
    assert thread["messages"][1]["content"] == "Let us define the PRD."
    assert thread["state"] == "conversing"


async def test_propose_finalize_transitions_session(app, client):
    app.state.llm_provider = FakeProvider(turns=[("The PRD is ready to write.", True)])
    base = await open_prd_thread(client)
    events = await stream_events(client, f"{base}/thread/messages/", "That's everything")
    session_parts = [e for e in events if e["type"] == "data-session"]
    assert session_parts and session_parts[-1]["data"]["state"] == "ready_to_finalize"
    thread = (await client.get(f"{base}/thread/")).json()
    assert thread["state"] == "ready_to_finalize"


async def test_turn_requires_thread(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    project = (
        await client.post("/api/workspaces/acme/projects/", json=CREATE_PROJECT)
    ).json()
    stories = (
        await client.get(
            f"/api/workspaces/acme/projects/{project['id']}/sprint-zero/stories/"
        )
    ).json()
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{stories[0]['id']}/thread/messages/",
        json={"content": "hi"},
    )
    assert res.status_code == 404
