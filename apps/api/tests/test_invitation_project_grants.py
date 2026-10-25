"""Project access carried on a workspace invitation (GIN-529).

The gap this closes: someone with no account cannot be a `ProjectMember` — there
is no user to point at — so an admin had to re-open every project after the
invitee accepted. The grant rides on the invitation and is applied at redemption.
"""
from sqlalchemy import select

from gigsnano_api.features.invitations import service
from gigsnano_api.models import WorkspaceInvitation

PASSWORD = "s3cret!"


async def owner_with_project(client, *, slug: str = "acme"):
    """Ada owns `slug` and one project. Leaves Ada signed in."""
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": PASSWORD,
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": slug})
    project = (
        await client.post(f"/api/workspaces/{slug}/projects/", json={
            "name": "Mobile App", "identifier": "MBA", "flow": "fresh",
            "cover_image_url": "https://img.test/c.jpg",
        })
    ).json()
    return project


async def invite(client, email: str, grants: list[dict] | None = None, slug: str = "acme"):
    return await client.post(
        f"/api/workspaces/{slug}/invitations/",
        json={"emails": [email], "role": "member", "project_grants": grants or []},
    )


async def token_for(db_session, email: str) -> str:
    """Only the hash is stored, so mint a token the way the service does."""
    inv = (
        await db_session.execute(
            select(WorkspaceInvitation).where(WorkspaceInvitation.email == email)
        )
    ).scalar_one()
    raw = service.new_token()
    inv.token_hash = service.hash_token(raw)
    await db_session.commit()
    return raw


async def accept_as(client, db_session, email: str, name: str):
    """The invitee signs up and redeems their invitation."""
    raw = await token_for(db_session, email)
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-up/", json={
        "display_name": name, "email": email, "password": PASSWORD,
    })
    return await client.post(f"/api/auth/invitations/{raw}/accept/")


async def test_accepting_applies_the_project_grant(client, db_session):
    """The whole point: invite with a project, accept, the project is already there."""
    project = await owner_with_project(client)
    res = await invite(client, "grace@example.test", [{"project_id": project["id"]}])
    assert res.status_code == 200
    assert res.json()["results"][0]["outcome"] == "sent"

    assert (await accept_as(client, db_session, "grace@example.test", "Grace H")).status_code == 200

    projects = await client.get("/api/workspaces/acme/projects/")
    assert [p["id"] for p in projects.json()] == [project["id"]]

    members = await client.get(f"/api/workspaces/acme/projects/{project['id']}/members/")
    grace = [m for m in members.json() if m["email"] == "grace@example.test"]
    assert len(grace) == 1
    assert grace[0]["role"] == "member"
    assert grace[0]["status"] == "active"


async def test_grant_role_is_honoured(client, db_session):
    project = await owner_with_project(client)
    await invite(client, "grace@example.test", [{"project_id": project["id"], "role": "admin"}])
    await accept_as(client, db_session, "grace@example.test", "Grace H")

    members = await client.get(f"/api/workspaces/acme/projects/{project['id']}/members/")
    assert [m["role"] for m in members.json() if m["email"] == "grace@example.test"] == ["admin"]


async def test_grant_is_visible_on_the_invitation_before_acceptance(client):
    """The project screens read this to show who is on the way."""
    project = await owner_with_project(client)
    await invite(client, "grace@example.test", [{"project_id": project["id"]}])

    row = (await client.get("/api/workspaces/acme/invitations/")).json()[0]
    assert row["project_grants"] == [{"project_id": project["id"], "role": "member"}]


async def test_grant_alone_gives_nothing_before_acceptance(client):
    """A grant is a promise, not access. The invitation stays the only gate."""
    project = await owner_with_project(client)
    await invite(client, "grace@example.test", [{"project_id": project["id"]}])

    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Grace H", "email": "grace@example.test", "password": PASSWORD,
    })
    assert (await client.get(f"/api/workspaces/acme/projects/{project['id']}/")).status_code == 403


async def test_project_from_another_workspace_is_refused(client):
    """Tenant boundary: a grant must not seat someone in a workspace nobody
    invited them to. Checked when the promise is made, not when it is kept."""
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Eve", "email": "eve@example.test", "password": PASSWORD,
    })
    await client.post("/api/workspaces/", json={"name": "Other", "slug": "other"})
    outsider = (
        await client.post("/api/workspaces/other/projects/", json={
            "name": "Secret", "identifier": "SEC", "flow": "fresh",
            "cover_image_url": "https://img.test/c.jpg",
        })
    ).json()
    await client.post("/api/auth/sign-out/")

    await owner_with_project(client)
    res = await invite(client, "grace@example.test", [{"project_id": outsider["id"]}])
    assert res.status_code == 404


async def test_owner_cannot_be_granted_by_invitation(client):
    project = await owner_with_project(client)
    res = await invite(client, "grace@example.test", [{"project_id": project["id"], "role": "owner"}])
    assert res.status_code == 400


async def test_grant_survives_a_deleted_project(client, db_session):
    """A project can go away while an invitation is outstanding. The accept must
    still succeed — the workspace seat is what was promised."""
    project = await owner_with_project(client)
    await invite(client, "grace@example.test", [{"project_id": project["id"]}])
    assert (await client.delete(f"/api/workspaces/acme/projects/{project['id']}/")).status_code < 300

    assert (await accept_as(client, db_session, "grace@example.test", "Grace H")).status_code == 200
    assert (await client.get("/api/workspaces/acme/projects/")).json() == []


async def test_re_inviting_replaces_the_grants(client, db_session):
    """The latest invitation is what the operator just decided — a union would
    make it impossible to take a project back off an outstanding invite."""
    first = await owner_with_project(client)
    second = (
        await client.post("/api/workspaces/acme/projects/", json={
            "name": "Web App", "identifier": "WEB", "flow": "fresh",
            "cover_image_url": "https://img.test/c.jpg",
        })
    ).json()

    await invite(client, "grace@example.test", [{"project_id": first["id"]}])
    res = await invite(client, "grace@example.test", [{"project_id": second["id"]}])
    assert res.json()["results"][0]["outcome"] == "resent"

    await accept_as(client, db_session, "grace@example.test", "Grace H")
    projects = await client.get("/api/workspaces/acme/projects/")
    assert [p["id"] for p in projects.json()] == [second["id"]]


async def test_existing_member_is_added_to_the_project_now(client):
    """"Already a member" must not swallow the project access that was the
    actual request — they have a user, so grant it immediately."""
    project = await owner_with_project(client)
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Alan Turing", "email": "alan@example.test", "password": PASSWORD,
    })
    await client.post("/api/auth/sign-in/", json={"email": "ada@example.test", "password": PASSWORD})
    await client.post("/api/workspaces/acme/members/", json={"email": "alan@example.test"})

    res = await invite(client, "alan@example.test", [{"project_id": project["id"]}])
    assert res.json()["results"][0]["outcome"] == "already_member"

    members = await client.get(f"/api/workspaces/acme/projects/{project['id']}/members/")
    assert "alan@example.test" in [m["email"] for m in members.json()]


async def test_accepting_twice_does_not_duplicate_membership(client, db_session):
    """A second redemption of the same grant must not violate the project member
    uniqueness constraint and abort the accept."""
    project = await owner_with_project(client)
    await invite(client, "grace@example.test", [{"project_id": project["id"]}])
    await accept_as(client, db_session, "grace@example.test", "Grace H")

    # Ada re-invites the same person, who is now a member; the grant re-applies.
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-in/", json={"email": "ada@example.test", "password": PASSWORD})
    res = await invite(client, "grace@example.test", [{"project_id": project["id"]}])
    assert res.status_code == 200

    members = await client.get(f"/api/workspaces/acme/projects/{project['id']}/members/")
    assert len([m for m in members.json() if m["email"] == "grace@example.test"]) == 1
