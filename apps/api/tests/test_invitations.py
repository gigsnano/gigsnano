from sqlalchemy import select

from gigsnano_api.features.invitations import service
from gigsnano_api.models import EInvitationStatus, WorkspaceInvitation


async def sign_up(client, email: str, name: str):
    res = await client.post(
        "/api/auth/sign-up/",
        json={"display_name": name, "email": email, "password": "s3cret!"},
    )
    assert res.status_code == 201
    return res.json()


async def owner_with_invite(client, invite_email: str = "grace@example.test", role: str = "member"):
    """Ada owns 'acme' and has invited an unknown email. Leaves Ada signed in."""
    await sign_up(client, "ada@example.test", "Ada Lovelace")
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    res = await client.post(
        "/api/workspaces/acme/members/", json={"email": invite_email, "role": role}
    )
    assert res.status_code == 201
    return res.json()


async def token_for(db_session, email: str) -> str:
    """Issue a known accept token for `email`.

    Only the hash is stored (GIN-526), so a test cannot read the raw value back
    out of the row — it mints one the same way the service does instead.
    """
    inv = (
        await db_session.execute(
            select(WorkspaceInvitation).where(WorkspaceInvitation.email == email)
        )
    ).scalar_one()
    raw = service.new_token()
    inv.token_hash = service.hash_token(raw)
    await db_session.commit()
    return raw


async def test_list_invitations_returns_iworkspaceinvitation_shape(client):
    await owner_with_invite(client)
    res = await client.get("/api/workspaces/acme/invitations/")
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 1
    row = body[0]
    assert set(row) == {
        "id", "workspace_slug", "email", "role", "invited_by_name", "created_at",
        "status", "expires_at", "last_sent_at", "accepted_at", "resend_count",
        "project_grants",
    }
    assert row["status"] == "pending"
    assert row["email"] == "grace@example.test"
    assert row["role"] == "member"
    assert row["invited_by_name"] == "Ada Lovelace"
    assert row["workspace_slug"] == "acme"
    assert "token" not in row


async def test_revoke_invitation_settles_it(client):
    """Revoking transitions the row rather than deleting it: the Invitations
    screen is the audit trail of who was invited and what became of it."""
    invite = await owner_with_invite(client)
    res = await client.delete(f"/api/workspaces/acme/invitations/{invite['id']}/")
    assert res.status_code == 204

    remaining = (await client.get("/api/workspaces/acme/invitations/")).json()
    assert [r["status"] for r in remaining] == ["revoked"]
    # ...but it no longer counts as a pending member on the members list.
    members = (await client.get("/api/workspaces/acme/members/")).json()
    assert [m for m in members if m["email"] == "grace@example.test"] == []


async def test_revoke_unknown_invitation_404(client):
    await owner_with_invite(client)
    res = await client.delete("/api/workspaces/acme/invitations/does-not-exist/")
    assert res.status_code == 404


async def test_accept_invitation_by_token_makes_active_member(client, db_session):
    await owner_with_invite(client)
    token = await token_for(db_session, "grace@example.test")
    await client.post("/api/auth/sign-out/")

    grace = await sign_up(client, "grace@example.test", "Grace Hopper")
    res = await client.post(f"/api/auth/invitations/{token}/accept/", json={})
    assert res.status_code == 200
    assert res.json() == {"workspace_slug": "acme"}

    # Grace is now an active member and can reach the workspace.
    assert (await client.get("/api/workspaces/acme/")).status_code == 200
    # The invitation is spent but retained as history; the status check is what
    # makes it single-use now that the row survives.
    row = (
        await db_session.execute(
            select(WorkspaceInvitation).where(WorkspaceInvitation.email == "grace@example.test")
        )
    ).scalar_one()
    assert row.status is EInvitationStatus.ACCEPTED
    assert grace["email"] == "grace@example.test"


async def test_accept_invitation_wrong_email_forbidden(client, db_session):
    await owner_with_invite(client)
    token = await token_for(db_session, "grace@example.test")
    await client.post("/api/auth/sign-out/")

    await sign_up(client, "bob@example.test", "Bob Kahn")
    res = await client.post(f"/api/auth/invitations/{token}/accept/", json={})
    assert res.status_code == 403


async def test_accept_invalid_token_404(client):
    await sign_up(client, "ada@example.test", "Ada Lovelace")
    res = await client.post("/api/auth/invitations/not-a-real-token/accept/", json={})
    assert res.status_code == 404
