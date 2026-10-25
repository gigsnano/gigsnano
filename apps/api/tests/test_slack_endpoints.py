async def setup_admin_workspace(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})


async def add_member_and_sign_in(client) -> dict:
    alan = (await client.post("/api/auth/sign-up/", json={
        "display_name": "Alan Turing", "email": "alan@example.test", "password": "s3cret!",
    })).json()
    await client.post("/api/auth/sign-out/")
    await client.post(
        "/api/auth/sign-in/", json={"email": "ada@example.test", "password": "s3cret!"}
    )
    await client.post("/api/workspaces/acme/members/", json={"user_id": alan["id"]})
    await client.post("/api/auth/sign-out/")
    await client.post(
        "/api/auth/sign-in/", json={"email": "alan@example.test", "password": "s3cret!"}
    )
    return alan


async def test_status_disconnected_by_default(client):
    await setup_admin_workspace(client)
    res = await client.get("/api/workspaces/acme/slack/")
    assert res.json() == {
        "connected": False, "team_name": None, "default_channel_name": None, "notify_events": [],
    }


async def test_install_url_carries_signed_state(client):
    await setup_admin_workspace(client)
    res = await client.get("/api/workspaces/acme/slack/install-url/")
    assert res.status_code == 200
    assert "state=" in res.json()["url"]


async def test_connect_callback_channel_set_disconnect_flow(client):
    await setup_admin_workspace(client)
    install = (await client.get("/api/workspaces/acme/slack/install-url/")).json()
    state = install["url"].split("state=")[1].split("&")[0]

    callback = await client.post(
        "/api/workspaces/acme/slack/oauth/callback/", json={"code": "fake-code", "state": state}
    )
    assert callback.status_code == 200
    body = callback.json()
    assert body["connected"] is True
    assert body["team_name"] == "Acme (fake)"
    assert set(body["notify_events"]) == {
        "story.created", "story.updated", "story.assigned", "sprint.completed",
    }

    channels = (await client.get("/api/workspaces/acme/slack/channels/")).json()
    assert len(channels) == 3
    chosen = channels[0]

    updated = await client.patch(
        "/api/workspaces/acme/slack/",
        json={
            "default_channel_id": chosen["id"], "default_channel_name": chosen["name"],
            "notify_events": ["story.created"],
        },
    )
    assert updated.status_code == 200
    assert updated.json()["default_channel_name"] == chosen["name"]
    assert updated.json()["notify_events"] == ["story.created"]

    disconnected = await client.post("/api/workspaces/acme/slack/disconnect/")
    assert disconnected.json() == {"success": True}
    status_after = (await client.get("/api/workspaces/acme/slack/")).json()
    assert status_after["connected"] is False


async def test_channel_set_before_connect_is_409(client):
    await setup_admin_workspace(client)
    res = await client.patch(
        "/api/workspaces/acme/slack/", json={"default_channel_id": "C1", "notify_events": None}
    )
    assert res.status_code == 409


async def test_non_admin_gets_403(client):
    await setup_admin_workspace(client)
    await add_member_and_sign_in(client)
    res = await client.get("/api/workspaces/acme/slack/install-url/")
    assert res.status_code == 403
