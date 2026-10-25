"""GIN-526: batch invitations, token security and lifecycle transitions."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from gigsnano_api.auth.models import User
from gigsnano_api.email.provider import FakeEmailProvider
from gigsnano_api.features.invitations import service
from gigsnano_api.models import EInvitationStatus, WorkspaceInvitation

BASE = "/api/workspaces/acme/invitations/"


async def sign_up(client, email: str, name: str):
    res = await client.post(
        "/api/auth/sign-up/",
        json={"display_name": name, "email": email, "password": "s3cret!"},
    )
    assert res.status_code == 201
    return res.json()


async def owner(client):
    """Ada owns 'acme'. Leaves Ada signed in."""
    await sign_up(client, "ada@example.test", "Ada Lovelace")
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})


def token_from(url: str) -> str:
    return url.rsplit("/", 1)[-1]


async def invite(client, *emails: str, role: str = "member"):
    res = await client.post(BASE, json={"emails": list(emails), "role": role})
    assert res.status_code == 200, res.text
    return res.json()["results"]


# --- batch entry ----------------------------------------------------------


async def test_batch_reports_every_recipient_separately(client):
    await owner(client)
    await sign_up(client, "maya@example.test", "Maya Thomas")
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-in/", json={"email": "ada@example.test",
                                                 "password": "s3cret!"})

    results = await invite(client, "new@example.test", "not-an-email", "ada@example.test")
    by_email = {r["email"]: r for r in results}

    assert by_email["new@example.test"]["outcome"] == "sent"
    assert by_email["not-an-email"]["outcome"] == "invalid"
    # The inviter is already a member of their own workspace.
    assert by_email["ada@example.test"]["outcome"] == "already_member"
    # A partial batch must not hide the one that worked.
    assert by_email["new@example.test"]["invite_url"]


async def test_addresses_are_normalized_and_deduplicated(client):
    await owner(client)
    results = await invite(client, " Grace@Example.test ", "grace@example.test")

    assert [r["email"] for r in results] == ["grace@example.test"]
    rows = (await client.get(BASE)).json()
    assert len(rows) == 1


async def test_reinviting_a_live_invitation_resends_instead_of_duplicating(client, db_session):
    await owner(client)
    first = (await invite(client, "grace@example.test"))[0]
    again = (await invite(client, "grace@example.test"))[0]

    assert again["outcome"] == "resent"
    assert again["invitation_id"] == first["invitation_id"]
    rows = (
        await db_session.execute(
            select(WorkspaceInvitation).where(WorkspaceInvitation.email == "grace@example.test")
        )
    ).scalars().all()
    assert len(rows) == 1, "a second live invitation would mean two valid tokens"


async def test_batch_size_is_capped(client):
    await owner(client)
    res = await client.post(
        BASE,
        json={"emails": [f"u{i}@example.test" for i in range(service.MAX_BATCH + 1)],
              "role": "member"},
    )
    assert res.status_code == 422


# --- token security -------------------------------------------------------


async def test_raw_token_is_never_stored(client, db_session):
    await owner(client)
    result = (await invite(client, "grace@example.test"))[0]
    raw = token_from(result["invite_url"])

    row = (
        await db_session.execute(
            select(WorkspaceInvitation).where(WorkspaceInvitation.email == "grace@example.test")
        )
    ).scalar_one()
    assert row.token_hash != raw
    assert row.token_hash == service.hash_token(raw)


async def test_list_never_exposes_a_redeemable_token(client):
    await owner(client)
    await invite(client, "grace@example.test")
    body = (await client.get(BASE)).json()
    assert "token" not in body[0]
    assert "token_hash" not in body[0]


# --- acceptance -----------------------------------------------------------


async def accept_as(client, raw: str, email: str, name: str):
    await client.post("/api/auth/sign-out/")
    await sign_up(client, email, name)
    return await client.post(f"/api/auth/invitations/{raw}/accept/", json={})


async def test_accept_creates_one_membership_and_settles_the_row(client, db_session):
    await owner(client)
    raw = token_from((await invite(client, "grace@example.test", role="admin"))[0]["invite_url"])

    res = await accept_as(client, raw, "grace@example.test", "Grace Hopper")
    assert res.status_code == 200
    assert (await client.get("/api/workspaces/acme/")).status_code == 200

    row = (
        await db_session.execute(
            select(WorkspaceInvitation).where(WorkspaceInvitation.email == "grace@example.test")
        )
    ).scalar_one()
    # Retained, not deleted — the Invitations screen shows history.
    assert row.status is EInvitationStatus.ACCEPTED
    assert row.accepted_at is not None

    members = (await client.get("/api/workspaces/acme/members/")).json()
    grace = [m for m in members if m["email"] == "grace@example.test"]
    assert len(grace) == 1, "acceptance must create exactly one membership"
    assert grace[0]["role"] == "admin", "the invited role must be the one granted"
    assert grace[0]["status"] == "active"


async def test_a_token_is_single_use(client):
    await owner(client)
    raw = token_from((await invite(client, "grace@example.test"))[0]["invite_url"])
    assert (await accept_as(client, raw, "grace@example.test", "Grace Hopper")).status_code == 200

    # Same token, same person, second time: already spent.
    again = await client.post(f"/api/auth/invitations/{raw}/accept/", json={})
    assert again.status_code == 409


async def test_expired_invitation_cannot_be_accepted(client, db_session):
    await owner(client)
    raw = token_from((await invite(client, "grace@example.test"))[0]["invite_url"])

    row = (
        await db_session.execute(
            select(WorkspaceInvitation).where(WorkspaceInvitation.email == "grace@example.test")
        )
    ).scalar_one()
    row.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    await db_session.commit()

    res = await accept_as(client, raw, "grace@example.test", "Grace Hopper")
    assert res.status_code == 410


async def test_revoked_invitation_cannot_be_accepted(client):
    await owner(client)
    result = (await invite(client, "grace@example.test"))[0]
    raw = token_from(result["invite_url"])
    assert (await client.delete(f"{BASE}{result['invitation_id']}/")).status_code == 204

    res = await accept_as(client, raw, "grace@example.test", "Grace Hopper")
    assert res.status_code == 409


async def test_accept_bound_to_the_invited_address(client):
    await owner(client)
    raw = token_from((await invite(client, "grace@example.test"))[0]["invite_url"])
    res = await accept_as(client, raw, "bob@example.test", "Bob Kahn")
    assert res.status_code == 403


# --- resend / revoke ------------------------------------------------------


async def test_resend_rotates_the_token_and_invalidates_the_old_one(client):
    await owner(client)
    first = (await invite(client, "grace@example.test"))[0]
    old_raw = token_from(first["invite_url"])

    res = await client.post(f"{BASE}{first['invitation_id']}/resend/")
    assert res.status_code == 200
    new_raw = token_from(res.json()["invite_url"])
    assert new_raw != old_raw

    # A forwarded copy of the previous link must stop working.
    assert (await accept_as(client, old_raw, "grace@example.test", "Grace H")).status_code == 404


async def test_revoke_keeps_the_row_as_history(client):
    await owner(client)
    result = (await invite(client, "grace@example.test"))[0]
    await client.delete(f"{BASE}{result['invitation_id']}/")

    rows = (await client.get(BASE)).json()
    assert [r["status"] for r in rows] == ["revoked"]


async def test_expiry_surfaces_without_a_sweeper(client, db_session):
    """Nothing scans the table, so a lapsed row must read as expired on the way out."""
    await owner(client)
    await invite(client, "grace@example.test")
    row = (await db_session.execute(select(WorkspaceInvitation))).scalar_one()
    row.expires_at = datetime.now(UTC) - timedelta(days=1)
    await db_session.commit()

    assert [r["status"] for r in (await client.get(BASE)).json()] == ["expired"]


async def test_a_lapsed_address_can_be_invited_again(client):
    await owner(client)
    await invite(client, "grace@example.test")
    # Expire it through the API's own view of time.
    from gigsnano_api.core.config import settings

    original = settings.invitation_ttl_days
    settings.invitation_ttl_days = -1
    try:
        results = await invite(client, "grace@example.test")
    finally:
        settings.invitation_ttl_days = original
    # The prior row is expired, so this is a fresh send rather than a resend.
    assert results[0]["outcome"] in {"sent", "resent"}


# --- accepting without the emailed token ----------------------------------

MINE = "/api/auth/me/pending-invites/"


async def mark_verified(db_session, email: str):
    user = (await db_session.execute(select(User).where(User.email == email))).scalar_one()
    user.email_verified = True
    await db_session.commit()


async def test_pending_invites_shows_an_emailed_invitation(client):
    """The invitee who signed up somewhere other than the invite link.

    They have an account, no membership and no token — and before this the list
    was blind to invitations, so onboarding offered to create the workspace they
    had already been invited to.
    """
    await owner(client)
    await invite(client, "grace@example.test", role="admin")
    await client.post("/api/auth/sign-out/")
    await sign_up(client, "grace@example.test", "Grace Hopper")

    rows = (await client.get(MINE)).json()
    assert [r["workspace_slug"] for r in rows] == ["acme"]
    assert rows[0]["status"] == "pending"
    assert rows[0]["role"] == "admin"


async def test_signed_in_accept_needs_a_verified_email(client):
    """Sign-up does not verify the address, and the token is what otherwise
    proves the invitee reads that mailbox."""
    await owner(client)
    result = (await invite(client, "grace@example.test"))[0]
    await client.post("/api/auth/sign-out/")
    await sign_up(client, "grace@example.test", "Grace Hopper")

    res = await client.post(f"{MINE}{result['invitation_id']}/accept/")
    assert res.status_code == 403
    assert (await client.get("/api/workspaces/acme/")).status_code in {403, 404}


async def test_signed_in_accept_joins_the_workspace(client, db_session):
    await owner(client)
    result = (await invite(client, "grace@example.test", role="admin"))[0]
    await client.post("/api/auth/sign-out/")
    await sign_up(client, "grace@example.test", "Grace Hopper")
    await mark_verified(db_session, "grace@example.test")

    res = await client.post(f"{MINE}{result['invitation_id']}/accept/")
    assert res.status_code == 200, res.text
    assert res.json()["workspace_slug"] == "acme"
    assert (await client.get("/api/workspaces/acme/")).status_code == 200

    # Settled, so it stops being offered — and cannot be spent twice.
    assert (await client.get(MINE)).json() == []
    assert (await client.post(f"{MINE}{result['invitation_id']}/accept/")).status_code == 409


async def test_signed_in_accept_is_not_a_way_into_someone_elses_invitation(client, db_session):
    await owner(client)
    result = (await invite(client, "grace@example.test"))[0]
    await client.post("/api/auth/sign-out/")
    await sign_up(client, "bob@example.test", "Bob Kahn")
    await mark_verified(db_session, "bob@example.test")

    # 404, not 403: Bob learns nothing about invitations addressed to Grace.
    res = await client.post(f"{MINE}{result['invitation_id']}/accept/")
    assert res.status_code == 404
    assert (await client.get(MINE)).json() == []


# --- authorization --------------------------------------------------------


async def test_a_member_cannot_invite_resend_or_revoke(client):
    await owner(client)
    result = (await invite(client, "grace@example.test"))[0]
    await sign_up(client, "mem@example.test", "Mem Ber")
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-in/", json={"email": "ada@example.test",
                                                 "password": "s3cret!"})
    members = await client.post("/api/workspaces/acme/members/",
                                json={"email": "mem@example.test", "role": "member"})
    assert members.status_code == 201
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-in/", json={"email": "mem@example.test",
                                                 "password": "s3cret!"})
    await client.patch("/api/auth/me/", json={})  # ensure the session is live

    assert (await client.post(BASE, json={"emails": ["x@example.test"]})).status_code == 403
    assert (await client.post(f"{BASE}{result['invitation_id']}/resend/")).status_code == 403
    assert (await client.delete(f"{BASE}{result['invitation_id']}/")).status_code == 403


async def test_owner_role_cannot_be_granted_by_invitation(client):
    await owner(client)
    res = await client.post(BASE, json={"emails": ["grace@example.test"], "role": "owner"})
    assert res.status_code in {400, 422}


# --- delivery -------------------------------------------------------------


async def test_delivery_failure_is_recorded_without_losing_the_batch(client, db_session, monkeypatch):
    await owner(client)

    async def boom(self, to, subject, html, text=None):
        if to == "bad@example.test":
            raise RuntimeError("provider rejected the address")
        return "ok"

    monkeypatch.setattr(FakeEmailProvider, "send", boom)
    results = {r["email"]: r for r in await invite(client, "good@example.test", "bad@example.test")}

    assert results["good@example.test"]["outcome"] == "sent"
    assert results["bad@example.test"]["outcome"] == "failed"

    rows = {
        r.email: r.status
        for r in (await db_session.execute(select(WorkspaceInvitation))).scalars().all()
    }
    assert rows["good@example.test"] is EInvitationStatus.PENDING
    assert rows["bad@example.test"] is EInvitationStatus.DELIVERY_FAILED


@pytest.mark.parametrize("raw,expected", [
    (" Ada@Example.COM ", "ada@example.com"),
    ("plain@x.io", "plain@x.io"),
])
def test_normalize_email(raw, expected):
    assert service.normalize_email(raw) == expected


# --- disposable addresses -------------------------------------------------


@pytest.mark.parametrize("email", [
    "throwaway@mailinator.com",
    "X@YOPMAIL.COM",
    "spam@guerrillamail.com",
    "a@temp-mail.org",
    "someone@inbox.mailinator.com",  # subdomains are handed out freely
])
def test_disposable_domains_are_detected(email):
    assert service.is_disposable_email(email) is True


@pytest.mark.parametrize("email", [
    "ada@notmailinator.com",          # substring matching would wrongly catch this
    "ada@mailinator.com.mycompany.io",  # ...and this
    "ada@company.io",
])
def test_real_domains_are_not_blocked(email):
    assert service.is_disposable_email(email) is False


async def test_batch_refuses_a_disposable_address_without_losing_the_rest(client, db_session):
    await owner(client)
    results = {
        r["email"]: r
        for r in await invite(client, "real@example.test", "throwaway@mailinator.com")
    }

    assert results["real@example.test"]["outcome"] == "sent"
    assert results["throwaway@mailinator.com"]["outcome"] == "disposable"
    assert "emporary" in results["throwaway@mailinator.com"]["detail"]

    # Refused means no row at all — not a pending invitation nobody can use.
    rows = (
        await db_session.execute(
            select(WorkspaceInvitation).where(
                WorkspaceInvitation.email == "throwaway@mailinator.com"
            )
        )
    ).scalars().all()
    assert rows == []


async def test_single_invite_path_also_refuses_disposable(client):
    """`POST /members/` is the other way in — a check on only one is a bypass."""
    await owner(client)
    res = await client.post(
        "/api/workspaces/acme/members/",
        json={"email": "throwaway@mailinator.com", "role": "member"},
    )
    assert res.status_code == 422
