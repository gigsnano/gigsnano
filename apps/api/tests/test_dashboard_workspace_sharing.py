"""Workspace-shared dashboards — visible to colleagues, editable by nobody else."""

WIDGETS = {
    "widgets": [
        {"id": "w_status", "type": "status_chart", "title": "Status", "x": 0, "y": 0, "w": 4,
         "h": 4, "settings": {}},
    ]
}


async def _setup(client):
    """Ada owns 'acme' and a dashboard; Alan is an active member. Ada signed in."""
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Alan Turing", "email": "alan@example.test", "password": "s3cret!",
    })
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    member = (
        await client.post("/api/workspaces/acme/members/", json={"email": "alan@example.test"})
    ).json()
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-in/", json={
        "email": "alan@example.test", "password": "s3cret!",
    })
    await client.patch(f"/api/workspaces/acme/members/{member['id']}/", json={"accept": True})
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-in/", json={
        "email": "ada@example.test", "password": "s3cret!",
    })
    dashboard = (
        await client.post("/api/workspaces/acme/dashboards/", json={
            "name": "Delivery", "description": "", "config": WIDGETS,
        })
    ).json()
    return dashboard


async def _as_alan(client):
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-in/", json={
        "email": "alan@example.test", "password": "s3cret!",
    })


async def test_a_private_dashboard_is_invisible_to_colleagues(client):
    dashboard = await _setup(client)
    await _as_alan(client)
    assert (await client.get("/api/workspaces/acme/dashboards/")).json() == []
    res = await client.get(f"/api/workspaces/acme/dashboards/{dashboard['id']}/")
    # 404, not 403 — a private dashboard must not be probeable for existence.
    assert res.status_code == 404


async def test_sharing_makes_it_visible_to_the_workspace(client):
    dashboard = await _setup(client)
    shared = (
        await client.post(
            f"/api/workspaces/acme/dashboards/{dashboard['id']}/share/",
            json={"visibility": "shared"},
        )
    ).json()
    assert shared["visibility"] == "shared"
    # No link is minted: the viewer is already authenticated into the workspace.
    assert shared["public_token"] is None

    await _as_alan(client)
    listed = (await client.get("/api/workspaces/acme/dashboards/")).json()
    assert [d["id"] for d in listed] == [dashboard["id"]]
    assert (
        await client.get(f"/api/workspaces/acme/dashboards/{dashboard['id']}/")
    ).status_code == 200


async def test_a_shared_dashboard_is_read_only_for_everyone_but_its_owner(client):
    """Sharing widens who can look, never who can edit."""
    dashboard = await _setup(client)
    await client.post(
        f"/api/workspaces/acme/dashboards/{dashboard['id']}/share/",
        json={"visibility": "shared"},
    )
    await _as_alan(client)

    assert (
        await client.patch(
            f"/api/workspaces/acme/dashboards/{dashboard['id']}/", json={"name": "Mine now"}
        )
    ).status_code == 404
    assert (
        await client.delete(f"/api/workspaces/acme/dashboards/{dashboard['id']}/")
    ).status_code == 404
    # And a colleague cannot re-share it further, to the whole internet or back.
    assert (
        await client.post(
            f"/api/workspaces/acme/dashboards/{dashboard['id']}/share/",
            json={"visibility": "public"},
        )
    ).status_code == 404


async def test_shared_is_not_public(client):
    """'shared' must not be reachable anonymously — that is what 'public' is for."""
    dashboard = await _setup(client)
    shared = (
        await client.post(
            f"/api/workspaces/acme/dashboards/{dashboard['id']}/share/",
            json={"visibility": "shared"},
        )
    ).json()
    assert shared["public_token"] is None
    await client.post("/api/auth/sign-out/")
    # Nothing to fetch with: no token exists, and the id is not a public handle.
    assert (
        await client.get(f"/api/public/dashboards/{dashboard['id']}/")
    ).status_code in (401, 404)


async def test_unsharing_hides_it_again(client):
    dashboard = await _setup(client)
    await client.post(
        f"/api/workspaces/acme/dashboards/{dashboard['id']}/share/",
        json={"visibility": "shared"},
    )
    await client.post(
        f"/api/workspaces/acme/dashboards/{dashboard['id']}/share/",
        json={"visibility": "private"},
    )
    await _as_alan(client)
    assert (await client.get("/api/workspaces/acme/dashboards/")).json() == []


async def test_sharing_does_not_require_publicly_shareable_widgets(client):
    """The public-widget rule keeps anonymous link-holders away from widgets that
    leak. A signed-in colleague is already entitled to this workspace's data."""
    dashboard = await _setup(client)
    # A config whose only widget is one the public view refuses.
    await client.patch(
        f"/api/workspaces/acme/dashboards/{dashboard['id']}/",
        json={"config": {"widgets": [
            {"id": "w_mine", "type": "assigned_to_me", "title": "Mine",
             "x": 0, "y": 0, "w": 4, "h": 4, "settings": {}},
        ]}},
    )
    res = await client.post(
        f"/api/workspaces/acme/dashboards/{dashboard['id']}/share/",
        json={"visibility": "shared"},
    )
    assert res.status_code == 200
