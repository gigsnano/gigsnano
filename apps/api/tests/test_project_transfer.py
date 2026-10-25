"""GIN-85: GitHub-style project transfer — the source admin requests a transfer to
any workspace by slug; the destination OWNER is emailed and must accept before the
project moves (supersedes GIN-68's synchronous admin-in-both move)."""

from sqlalchemy import select

from gigsnano_api.models import ETransferStatus, ProjectTransferRequest


async def _signup(client, name, email):
    await client.post("/api/auth/sign-out/")
    await client.post(
        "/api/auth/sign-up/", json={"display_name": name, "email": email, "password": "s3cret!"}
    )


async def _login(client, email):
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-in/", json={"email": email, "password": "s3cret!"})


async def _make_project(client, slug, identifier="MBA"):
    return (
        await client.post(
            f"/api/workspaces/{slug}/projects/",
            json={
                "name": "Mobile App",
                "identifier": identifier,
                "flow": "fresh",
                "cover_image_url": "https://img.test/c.jpg",
            },
        )
    ).json()


async def setup(client):
    """Ada owns two workspaces: acme (holds project MBA) and beta (empty)."""
    await _signup(client, "Ada Lovelace", "ada@example.test")
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    await client.post("/api/workspaces/", json={"name": "Beta", "slug": "beta"})
    project = await _make_project(client, "acme")
    return project


async def _pending_token(db_session, project_id):
    req = (
        await db_session.execute(
            select(ProjectTransferRequest).where(
                ProjectTransferRequest.project_id == project_id,
                ProjectTransferRequest.status == ETransferStatus.PENDING,
            )
        )
    ).scalar_one()
    return req.token


async def test_request_creates_pending_and_does_not_move_yet(client, db_session):
    project = await setup(client)
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/transfer/",
        json={"destination_workspace_slug": "beta"},
    )
    assert res.status_code == 202, res.text
    body = res.json()
    assert body["status"] == "pending"
    assert body["dest_workspace_slug"] == "beta"
    assert body["invited_email"] == "ada@example.test"  # beta's owner
    assert "token" not in body  # secret

    # Still in acme until accepted.
    acme_ids = [p["id"] for p in (await client.get("/api/workspaces/acme/projects/")).json()]
    assert project["id"] in acme_ids

    # Source-side banner can read the pending request.
    pending = (await client.get(f"/api/workspaces/acme/projects/{project['id']}/transfer/")).json()
    assert pending["status"] == "pending"


async def test_owner_accepts_and_project_moves_with_stories(client, db_session):
    project = await setup(client)
    await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/transfer/",
        json={"destination_workspace_slug": "beta"},
    )
    token = await _pending_token(db_session, project["id"])
    res = await client.post(f"/api/auth/transfer-requests/{token}/accept/")
    assert res.status_code == 200, res.text
    assert res.json()["workspace_slug"] == "beta"

    beta_ids = [p["id"] for p in (await client.get("/api/workspaces/beta/projects/")).json()]
    acme_ids = [p["id"] for p in (await client.get("/api/workspaces/acme/projects/")).json()]
    assert project["id"] in beta_ids
    assert project["id"] not in acme_ids

    # Sprint-0 stories follow to the new slug, 404 under the old one.
    under_beta = await client.get(
        f"/api/workspaces/beta/projects/{project['id']}/sprint-zero/stories/"
    )
    assert under_beta.status_code == 200 and len(under_beta.json()) > 0
    under_acme = await client.get(
        f"/api/workspaces/acme/projects/{project['id']}/sprint-zero/stories/"
    )
    assert under_acme.status_code == 404


async def test_transfer_to_workspace_the_initiator_does_not_belong_to(client, db_session):
    """The headline GIN-85 change: Ada can transfer to Cara's 'gamma' even though she
    isn't a member — Cara (gamma's owner) is emailed and accepts."""
    project = await setup(client)
    await _signup(client, "Cara Fields", "cara@example.test")
    await client.post("/api/workspaces/", json={"name": "Gamma", "slug": "gamma"})

    await _login(client, "ada@example.test")
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/transfer/",
        json={"destination_workspace_slug": "gamma"},
    )
    assert res.status_code == 202, res.text  # no more 403 for non-membership
    assert res.json()["invited_email"] == "cara@example.test"

    token = await _pending_token(db_session, project["id"])
    # Ada (not the invited owner) cannot accept — accept is email-bound.
    assert (await client.post(f"/api/auth/transfer-requests/{token}/accept/")).status_code == 403

    await _login(client, "cara@example.test")
    accepted = await client.post(f"/api/auth/transfer-requests/{token}/accept/")
    assert accepted.status_code == 200, accepted.text
    gamma_ids = [p["id"] for p in (await client.get("/api/workspaces/gamma/projects/")).json()]
    assert project["id"] in gamma_ids


async def test_decline_leaves_project_in_source(client, db_session):
    project = await setup(client)
    await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/transfer/",
        json={"destination_workspace_slug": "beta"},
    )
    token = await _pending_token(db_session, project["id"])
    res = await client.post(f"/api/auth/transfer-requests/{token}/decline/")
    assert res.status_code == 200 and res.json()["status"] == "declined"
    acme_ids = [p["id"] for p in (await client.get("/api/workspaces/acme/projects/")).json()]
    assert project["id"] in acme_ids


async def test_source_admin_can_cancel_pending(client, db_session):
    project = await setup(client)
    await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/transfer/",
        json={"destination_workspace_slug": "beta"},
    )
    res = await client.delete(f"/api/workspaces/acme/projects/{project['id']}/transfer/")
    assert res.status_code == 204
    pending = await client.get(f"/api/workspaces/acme/projects/{project['id']}/transfer/")
    assert pending.json() is None


async def test_duplicate_request_conflicts(client):
    project = await setup(client)
    await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/transfer/",
        json={"destination_workspace_slug": "beta"},
    )
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/transfer/",
        json={"destination_workspace_slug": "beta"},
    )
    assert res.status_code == 409


async def test_identifier_clash_blocks_at_request_time(client):
    project = await setup(client)
    await _make_project(client, "beta", identifier="MBA")  # beta already has an MBA
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/transfer/",
        json={"destination_workspace_slug": "beta"},
    )
    assert res.status_code == 409
    assert "MBA" in res.json()["detail"]


async def test_same_workspace_rejected(client):
    project = await setup(client)
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/transfer/",
        json={"destination_workspace_slug": "acme"},
    )
    assert res.status_code == 400


async def test_non_admin_source_forbidden(client):
    """A plain workspace member can't initiate a transfer (still admin-gated)."""
    project = await setup(client)  # Ada (owner) created MBA
    bob_ws = (
        await client.post("/api/workspaces/acme/members/", json={"email": "bob@example.test"})
    ).json()
    await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/members/",
        json={"user_id": bob_ws["user_id"]},
    )
    await _signup(client, "Bob Reese", "bob@example.test")  # signs out Ada, signs in Bob
    await client.patch(f"/api/workspaces/acme/members/{bob_ws['id']}/", json={"accept": True})
    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/transfer/",
        json={"destination_workspace_slug": "beta"},
    )
    assert res.status_code == 403
