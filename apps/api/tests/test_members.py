async def sign_up(client, email: str, name: str):
    res = await client.post(
        "/api/auth/sign-up/",
        json={"display_name": name, "email": email, "password": "s3cret!"},
    )
    assert res.status_code == 201
    return res.json()


async def setup_workspace(client):
    """Ada owns 'acme'; Alan exists but is not a member. Leaves Ada signed in."""
    alan = await sign_up(client, "alan@example.test", "Alan Turing")
    await client.post("/api/auth/sign-out/")
    ada = await sign_up(client, "ada@example.test", "Ada Lovelace")
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    return ada, alan


async def test_add_member_by_user_id_is_active(client):
    _, alan = await setup_workspace(client)
    res = await client.post("/api/workspaces/acme/members/", json={"user_id": alan["id"]})
    assert res.status_code == 201
    body = res.json()
    assert body["status"] == "active"
    assert body["role"] == "member"
    assert body["display_name"] == "Alan Turing"
    assert body["workspace_slug"] == "acme"
    assert set(body) == {
        "id", "workspace_slug", "user_id", "display_name", "email",
        "avatar_url", "role", "status", "created_at",
    }


async def test_add_member_by_existing_email_is_pending(client):
    _, alan = await setup_workspace(client)
    res = await client.post(
        "/api/workspaces/acme/members/", json={"email": "alan@example.test"}
    )
    assert res.status_code == 201
    assert res.json()["status"] == "pending"
    assert res.json()["user_id"] == alan["id"]


async def test_add_unknown_email_creates_invitation_row(client):
    await setup_workspace(client)
    res = await client.post(
        "/api/workspaces/acme/members/", json={"email": "grace@example.test"}
    )
    assert res.status_code == 201
    assert res.json()["status"] == "pending"
    assert res.json()["user_id"] == ""

    members = (await client.get("/api/workspaces/acme/members/")).json()
    assert {m["email"] for m in members} == {"ada@example.test", "grace@example.test"}


async def test_duplicate_member_conflicts(client):
    _, alan = await setup_workspace(client)
    await client.post("/api/workspaces/acme/members/", json={"user_id": alan["id"]})
    res = await client.post("/api/workspaces/acme/members/", json={"user_id": alan["id"]})
    assert res.status_code == 409


async def test_invitee_sees_and_accepts_pending_invite(client):
    await setup_workspace(client)
    invite = (
        await client.post("/api/workspaces/acme/members/", json={"email": "alan@example.test"})
    ).json()
    await client.post("/api/auth/sign-out/")

    await client.post(
        "/api/auth/sign-in/", json={"email": "alan@example.test", "password": "s3cret!"}
    )
    pending = (await client.get("/api/auth/me/pending-invites/")).json()
    assert [p["id"] for p in pending] == [invite["id"]]

    res = await client.patch(
        f"/api/workspaces/acme/members/{invite['id']}/", json={"accept": True}
    )
    assert res.status_code == 200
    assert res.json()["status"] == "active"


async def test_role_change_requires_admin(client):
    _, alan = await setup_workspace(client)
    member = (
        await client.post("/api/workspaces/acme/members/", json={"user_id": alan["id"]})
    ).json()
    await client.post("/api/auth/sign-out/")

    await client.post(
        "/api/auth/sign-in/", json={"email": "alan@example.test", "password": "s3cret!"}
    )
    res = await client.patch(
        f"/api/workspaces/acme/members/{member['id']}/", json={"role": "admin"}
    )
    assert res.status_code == 403


async def test_remove_member_returns_success(client):
    _, alan = await setup_workspace(client)
    member = (
        await client.post("/api/workspaces/acme/members/", json={"user_id": alan["id"]})
    ).json()
    res = await client.delete(f"/api/workspaces/acme/members/{member['id']}/")
    assert res.status_code == 200
    assert res.json() == {"success": True}


async def test_owner_row_cannot_be_removed(client):
    await setup_workspace(client)
    members = (await client.get("/api/workspaces/acme/members/")).json()
    owner_row = next(m for m in members if m["role"] == "owner")
    res = await client.delete(f"/api/workspaces/acme/members/{owner_row['id']}/")
    assert res.status_code == 400


async def test_cannot_add_member_as_owner(client):
    _, alan = await setup_workspace(client)
    res = await client.post(
        "/api/workspaces/acme/members/", json={"user_id": alan["id"], "role": "owner"}
    )
    assert res.status_code == 400


async def test_pending_admin_cannot_change_roles(client):
    """An admin-invited-by-email is PENDING until they accept; they must not be able
    to perform admin writes (role changes) before accepting. Regression for the
    privilege-escalation hole opened by the pending-inclusive context."""
    _, alan = await setup_workspace(client)  # Ada owns acme (signed in); Alan exists

    # Ada adds Grace as an active member (the target of the attempted role change).
    await client.post("/api/auth/sign-out/")
    grace = await sign_up(client, "grace@example.test", "Grace Hopper")
    await client.post("/api/auth/sign-out/")
    await client.post(
        "/api/auth/sign-in/", json={"email": "ada@example.test", "password": "s3cret!"}
    )
    grace_member = (
        await client.post("/api/workspaces/acme/members/", json={"user_id": grace["id"]})
    ).json()

    # Ada invites Alan by email as admin -> Alan is a PENDING admin.
    invite = (
        await client.post(
            "/api/workspaces/acme/members/",
            json={"email": "alan@example.test", "role": "admin"},
        )
    ).json()
    assert invite["status"] == "pending" and invite["role"] == "admin"
    await client.post("/api/auth/sign-out/")

    # Pending-admin Alan tries to change Grace's role -> must be forbidden.
    await client.post(
        "/api/auth/sign-in/", json={"email": "alan@example.test", "password": "s3cret!"}
    )
    res = await client.patch(
        f"/api/workspaces/acme/members/{grace_member['id']}/", json={"role": "admin"}
    )
    assert res.status_code == 403

    # ...but Alan CAN still accept his own invite (accept path unaffected).
    accept = await client.patch(
        f"/api/workspaces/acme/members/{invite['id']}/", json={"accept": True}
    )
    assert accept.status_code == 200
    assert accept.json()["status"] == "active"


async def test_added_member_lands_in_their_workspace_not_onboarding(client):
    """Membership IS having a workspace. `last_workspace_slug` is only a
    last-visited cache, but the frontend routes on it: report null and a member
    who never created a workspace gets bounced to /onboarding and told to make
    one. Covers the directory-add path, which grants membership without writing
    that cache."""
    _, alan = await setup_workspace(client)
    await client.post("/api/workspaces/acme/members/", json={"user_id": alan["id"]})
    await client.post("/api/auth/sign-out/")

    res = await client.post(
        "/api/auth/sign-in/", json={"email": "alan@example.test", "password": "s3cret!"}
    )
    assert res.json()["last_workspace_slug"] == "acme"
    me = await client.get("/api/auth/me/")
    assert me.json()["last_workspace_slug"] == "acme"


async def test_accepting_a_pending_invite_lands_in_that_workspace(client):
    """Same for the accept-by-email path: accepting flips the row to ACTIVE but
    writes no cache, so the next sign-in must still resolve to the workspace."""
    await setup_workspace(client)
    invite = (
        await client.post("/api/workspaces/acme/members/", json={"email": "alan@example.test"})
    ).json()
    await client.post("/api/auth/sign-out/")
    await client.post(
        "/api/auth/sign-in/", json={"email": "alan@example.test", "password": "s3cret!"}
    )
    # Pending membership alone is not a workspace to land in.
    assert (await client.get("/api/auth/me/")).json()["last_workspace_slug"] is None

    await client.patch(f"/api/workspaces/acme/members/{invite['id']}/", json={"accept": True})
    assert (await client.get("/api/auth/me/")).json()["last_workspace_slug"] == "acme"
