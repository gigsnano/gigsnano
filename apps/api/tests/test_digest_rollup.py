"""GIN-136: a user in N workspaces gets ONE digest email, not N.

Observed on prod at the 09:00 IST run: 7 emails to 5 people, one person getting
three. Each digest was individually correct — nobody chose "3 workspaces = 3
emails", it fell out of the scheduler fanning over workspaces while each delivery
sent its own mail.

The fix batches only the SEND. Per-workspace compute, delivery rows, templates and
the (user, workspace, run_date) idempotency key are all untouched, so the re-run
safety that stops a restart double-sending still holds.
"""

from datetime import datetime, timezone

from gigsnano_api.features.digests.schemas import (
    DigestItemOut,
    DigestOut,
    DigestSectionOut,
)
from gigsnano_api.features.digests.service import (
    PendingDigestEmail,
    flush_digest_emails,
    render_combined_digest_email,
    render_digest_email,
)
from gigsnano_api.models import EStoryPriority, EStoryStatus

CREATE_PROJECT = {
    "name": "Mobile App", "identifier": "MBA", "flow": "fresh",
    "cover_image_url": "https://img.test/c.jpg",
}


class _Delivery:
    """Stands in for a DigestDelivery row — the flush only writes body_html."""

    def __init__(self):
        self.body_html: str | None = None


class _Provider:
    """Records what would have been mailed."""

    def __init__(self):
        self.sent: list[tuple[str, str, str]] = []  # (to, subject, html)

    async def send(self, to: str, subject: str, html: str, **_kw):
        self.sent.append((to, subject, html))
        return "fake-ref"


def _digest(total_open: int = 1, title: str = "Fix it", slug: str = "acme") -> DigestOut:
    item = DigestItemOut(
        story_id="s1", code="P-1", title=title,
        status=EStoryStatus.TODO, priority=EStoryPriority.HIGH,
        target_date=None, project_id="p1", project_name="P", href="/x",
    )
    sections = (
        [DigestSectionOut(key="open", label="Open", count=1, items=[item])] if total_open else []
    )
    return DigestOut(
        workspace_slug=slug,
        user_id="u1",
        generated_at=datetime(2026, 7, 17, tzinfo=timezone.utc),
        total_open=total_open,
        sections=sections,
    )


def _pending(user_id: str, ws_name: str, delivery_id: str, **kw) -> PendingDigestEmail:
    return PendingDigestEmail(
        user_id=user_id,
        email=f"{user_id}@example.test",
        workspace_name=ws_name,
        digest=_digest(**kw),
        delivery_id=delivery_id,
        delivery=_Delivery(),
    )


# --- the bug ------------------------------------------------------------------


async def test_three_workspaces_produce_one_email():
    """The actual report: one user gets three emails every morning."""
    provider = _Provider()
    pending = [
        _pending("u1", "Gigsnano", "d1", title="A"),
        _pending("u1", "Globex", "d2", title="B"),
        _pending("u1", "Demo1", "d3", title="C"),
    ]
    sent = await flush_digest_emails(pending, provider)

    assert sent == 1, "three workspaces, one email"
    assert len(provider.sent) == 1
    to, _subject, html = provider.sent[0]
    assert to == "u1@example.test"
    # Nothing is dropped in the roll-up — every workspace is in there.
    for name in ("Gigsnano", "Globex", "Demo1"):
        assert name in html
    for title in ("A", "B", "C"):
        assert title in html


async def test_each_user_still_gets_their_own_email():
    provider = _Provider()
    pending = [
        _pending("u1", "Gigsnano", "d1"),
        _pending("u2", "Gigsnano", "d2"),
        _pending("u1", "Globex", "d3"),
    ]
    sent = await flush_digest_emails(pending, provider)

    assert sent == 2
    assert {to for to, _, _ in provider.sent} == {"u1@example.test", "u2@example.test"}


async def test_a_single_workspace_user_gets_exactly_what_they_got_before():
    """The common case must not change. One workspace = the original email,
    byte for byte."""
    provider = _Provider()
    part = _pending("u1", "Gigsnano", "d1")
    await flush_digest_emails([part], provider)

    expected_subject, expected_html = render_digest_email(part.digest, "d1")
    _to, subject, html = provider.sent[0]
    assert subject == expected_subject
    assert html == expected_html


async def test_the_subject_counts_every_workspace():
    provider = _Provider()
    await flush_digest_emails(
        [
            _pending("u1", "Gigsnano", "d1", total_open=2),
            _pending("u1", "Globex", "d2", total_open=3),
        ],
        provider,
    )
    _to, subject, _html = provider.sent[0]
    assert "5 open items" in subject  # 2 + 3, not "2" and "3" in two mails


async def test_each_delivery_records_the_email_that_carried_it():
    provider = _Provider()
    pending = [_pending("u1", "Gigsnano", "d1"), _pending("u1", "Globex", "d2")]
    await flush_digest_emails(pending, provider)

    _to, _subject, html = provider.sent[0]
    # Both rows point at the one email that actually went — the honest answer to
    # "what did we send you?".
    assert pending[0].delivery.body_html == html
    assert pending[1].delivery.body_html == html


# --- tracking stays per-workspace ---------------------------------------------


async def test_tracking_stays_attributed_per_workspace():
    """Each section keeps its own delivery_id, so clicks and opens still say which
    workspace they belong to even though one email carries all of them."""
    provider = _Provider()
    await flush_digest_emails(
        [_pending("u1", "Gigsnano", "d1"), _pending("u1", "Globex", "d2")], provider
    )
    _to, _subject, html = provider.sent[0]
    assert "d1" in html and "d2" in html


def test_combined_email_is_one_document_not_three():
    # Concatenating three rendered emails would nest <html> three deep. The
    # bodies are built separately and wrapped once.
    _subject, html = render_combined_digest_email(
        [_pending("u1", "A", "d1"), _pending("u1", "B", "d2"), _pending("u1", "C", "d3")]
    )
    assert html.lower().count("<html") <= 1


# --- guards -------------------------------------------------------------------


async def test_nothing_pending_sends_nothing():
    provider = _Provider()
    assert await flush_digest_emails([], provider) == 0
    assert provider.sent == []


async def test_no_provider_sends_nothing():
    # Keyless dev: there is no mailer. Must not explode.
    assert await flush_digest_emails([_pending("u1", "A", "d1")], None) == 0


# --- the sink, threaded through the real run ---------------------------------


async def test_run_defers_the_email_to_the_sink_instead_of_sending(client, db_session):
    """The wiring: with a sink, run_workspace_digests must record the delivery and
    the in-app notification but NOT send mail — the caller sends one per user.

    Uses the injected db_session, never the module-level async_session() (which
    reaches the real DB in tests).
    """
    from sqlalchemy import select

    from gigsnano_api.features.digests.service import run_workspace_digests
    from gigsnano_api.models import DigestDelivery, Workspace

    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    me = (await client.get("/api/auth/me/")).json()
    project = (await client.post("/api/workspaces/acme/projects/", json=CREATE_PROJECT)).json()
    story = (
        await client.post(
            f"/api/workspaces/acme/projects/{project['id']}/stories/", json={"title": "Work"}
        )
    ).json()
    await client.patch(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}/",
        json={"assignee_id": me["id"], "target_date": "2020-01-01"},
    )

    ws = (
        await db_session.execute(select(Workspace).where(Workspace.slug == "acme"))
    ).scalar_one()
    provider = _Provider()
    sink: list[PendingDigestEmail] = []

    result = await run_workspace_digests(
        db_session, ws, provider=provider, email_sink=sink
    )

    assert result.sent == 1
    # Deferred, not sent: the flush owns the mail now.
    assert provider.sent == [], "run must not send when a sink is given"
    assert len(sink) == 1
    assert sink[0].workspace_name == "Acme"

    # The delivery row still exists and still claims the email channel — the mail
    # is queued for the flush, not dropped.
    rows = (await db_session.execute(select(DigestDelivery))).scalars().all()
    assert len(rows) == 1
    assert "email" in rows[0].channels

    # And the flush turns it into exactly one mail.
    assert await flush_digest_emails(sink, provider) == 1
    assert len(provider.sent) == 1


async def test_run_without_a_sink_still_sends_immediately(client, db_session):
    """The admin trigger (POST .../digests/run/) passes no sink — one workspace,
    nothing to batch. That path must be unchanged."""
    from sqlalchemy import select

    from gigsnano_api.features.digests.service import run_workspace_digests
    from gigsnano_api.models import Workspace

    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    me = (await client.get("/api/auth/me/")).json()
    project = (await client.post("/api/workspaces/acme/projects/", json=CREATE_PROJECT)).json()
    story = (
        await client.post(
            f"/api/workspaces/acme/projects/{project['id']}/stories/", json={"title": "Work"}
        )
    ).json()
    await client.patch(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{story['id']}/",
        json={"assignee_id": me["id"], "target_date": "2020-01-01"},
    )

    ws = (
        await db_session.execute(select(Workspace).where(Workspace.slug == "acme"))
    ).scalar_one()
    provider = _Provider()

    await run_workspace_digests(db_session, ws, provider=provider)
    assert len(provider.sent) == 1, "no sink = send now, as before"
