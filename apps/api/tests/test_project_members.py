async def setup(client, *, accept: bool = True):
    """Ada owns workspace+project; Alan is a workspace member.

    Flow: sign up Alan → sign out → sign up Ada → create workspace → invite Alan
    by email (pending) → Alan signs in and accepts → Ada signs back in → creates
    the project. Returns (project, alan_ws_member_row); Ada stays signed in.

    `accept=False` stops after the invite, leaving Alan PENDING — the "invited
    state" the project-assignment tests below are about (GIN-528).
    """
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Alan Turing", "email": "alan@example.test", "password": "s3cret!",
    })
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    alan_ws = (
        await client.post("/api/workspaces/acme/members/", json={"email": "alan@example.test"})
    ).json()
    if accept:
        await client.post("/api/auth/sign-out/")
        await client.post("/api/auth/sign-in/", json={
            "email": "alan@example.test", "password": "s3cret!",
        })
        await client.patch(f"/api/workspaces/acme/members/{alan_ws['id']}/", json={"accept": True})
        await client.post("/api/auth/sign-out/")
        await client.post("/api/auth/sign-in/", json={
            "email": "ada@example.test", "password": "s3cret!",
        })
    project = (
        await client.post("/api/workspaces/acme/projects/", json={
            "name": "Mobile App", "identifier": "MBA", "flow": "fresh",
            "cover_image_url": "https://img.test/c.jpg",
        })
    ).json()
    return project, alan_ws


async def test_add_pending_workspace_member_to_project(client):
    """GIN-528: someone still in the invited state can be put on a project, so the
    work is waiting for them the moment they accept rather than after a second
    round-trip to an admin."""
    project, alan_ws = await setup(client, accept=False)
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/members/",
        json={"user_id": alan_ws["user_id"]},
    )
    assert res.status_code == 201
    # ACTIVE, not PENDING: the workspace invite is the gate, and a second
    # per-project acceptance would just be a hoop with no decision behind it.
    assert res.json()["status"] == "active"


async def test_project_row_grants_nothing_before_the_invite_is_accepted(client):
    """The workspace invite stays the only gate. Assigning a pending invitee to a
    project must not hand them workspace access early."""
    project, alan_ws = await setup(client, accept=False)
    await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/members/",
        json={"user_id": alan_ws["user_id"]},
    )
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-in/", json={
        "email": "alan@example.test", "password": "s3cret!",
    })
    res = await client.get(f"/api/workspaces/acme/projects/{project['id']}/")
    assert res.status_code == 403


async def test_accepting_the_invite_reveals_the_pre_assigned_project(client):
    """The point of the whole flow: accept → the project is already there."""
    project, alan_ws = await setup(client, accept=False)
    await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/members/",
        json={"user_id": alan_ws["user_id"]},
    )
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-in/", json={
        "email": "alan@example.test", "password": "s3cret!",
    })
    await client.patch(f"/api/workspaces/acme/members/{alan_ws['id']}/", json={"accept": True})
    res = await client.get("/api/workspaces/acme/projects/")
    assert res.status_code == 200
    assert [p["id"] for p in res.json()] == [project["id"]]


async def test_add_project_member_from_workspace_pool(client):
    project, alan_ws = await setup(client)
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/members/",
        json={"user_id": alan_ws["user_id"]},
    )
    assert res.status_code == 201
    body = res.json()
    assert body["role"] == "member"
    assert body["status"] == "active"
    assert body["project_id"] == project["id"]
    assert set(body) == {
        "id", "project_id", "user_id", "display_name", "email", "avatar_url", "role", "status",
    }


async def test_add_outsider_404(client):
    project, _ = await setup(client)
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/members/",
        json={"email": "grace@nowhere.test"},
    )
    assert res.status_code == 404


async def test_add_project_member_honors_payload_role(client):
    project, alan_ws = await setup(client)
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/members/",
        json={"user_id": alan_ws["user_id"], "role": "admin"},
    )
    assert res.status_code == 201
    assert res.json()["role"] == "admin"


async def test_add_project_member_requires_workspace_admin(client):
    """A plain workspace member must not be able to add project members."""
    project, alan_ws = await setup(client)
    grace = (
        await client.post("/api/auth/sign-up/", json={
            "display_name": "Grace Hopper", "email": "grace@example.test", "password": "s3cret!",
        })
    ).json()
    await client.post("/api/auth/sign-out/")
    await client.post(
        "/api/auth/sign-in/", json={"email": "ada@example.test", "password": "s3cret!"}
    )
    await client.post("/api/workspaces/acme/members/", json={"user_id": grace["id"]})
    # Add Grace as a project member (but not admin) to test that the endpoint gate checks admin role
    await client.post(f"/api/workspaces/acme/projects/{project['id']}/members/", json={"user_id": grace["id"]})
    await client.post("/api/auth/sign-out/")
    await client.post(
        "/api/auth/sign-in/", json={"email": "grace@example.test", "password": "s3cret!"}
    )

    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/members/",
        json={"user_id": alan_ws["user_id"]},
    )
    assert res.status_code == 403


async def test_update_role_and_remove(client):
    project, alan_ws = await setup(client)
    member = (
        await client.post(
            f"/api/workspaces/acme/projects/{project['id']}/members/",
            json={"user_id": alan_ws["user_id"]},
        )
    ).json()
    res = await client.patch(
        f"/api/workspaces/acme/projects/{project['id']}/members/{member['id']}/",
        json={"role": "admin"},
    )
    assert res.json()["role"] == "admin"
    res = await client.delete(
        f"/api/workspaces/acme/projects/{project['id']}/members/{member['id']}/"
    )
    assert res.json() == {"success": True}
    members = (
        await client.get(f"/api/workspaces/acme/projects/{project['id']}/members/")
    ).json()
    assert len(members) == 1  # only Ada (creator) remains
