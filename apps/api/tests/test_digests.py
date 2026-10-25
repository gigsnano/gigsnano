"""GIN-103: daily digest generation, delivery (idempotent), and tracking."""

import pytest

CREATE_PROJECT = {
    "name": "Mobile App", "identifier": "MBA", "flow": "fresh",
    "cover_image_url": "https://img.test/c.jpg",
}


async def setup(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    me = (await client.get("/api/auth/me/")).json()
    project = (await client.post("/api/workspaces/acme/projects/", json=CREATE_PROJECT)).json()
    return me, project


async def _assigned_story(client, project_id, me_id, title, target_date=None, priority=None):
    story = (
        await client.post(
            f"/api/workspaces/acme/projects/{project_id}/stories/", json={"title": title}
        )
    ).json()
    patch = {"assignee_id": me_id}
    if target_date:
        patch["target_date"] = target_date
    if priority:
        patch["priority"] = priority
    await client.patch(
        f"/api/workspaces/acme/projects/{project_id}/stories/{story['id']}/", json=patch
    )
    return story


async def test_items_ordered_by_priority_within_a_group(client):
    # GIN-99: within a due-date group, higher priority comes first.
    me, project = await setup(client)
    await _assigned_story(client, project["id"], me["id"], "Low one", "2020-01-01", "low")
    await _assigned_story(client, project["id"], me["id"], "Urgent one", "2020-01-01", "urgent")

    digest = (await client.get("/api/workspaces/acme/digests/me/")).json()
    overdue = next(s for s in digest["sections"] if s["key"] == "overdue")
    assert [i["title"] for i in overdue["items"]] == ["Urgent one", "Low one"]


async def test_preview_groups_pending_work(client):
    me, project = await setup(client)
    await _assigned_story(client, project["id"], me["id"], "Overdue thing", "2020-01-01")
    await _assigned_story(client, project["id"], me["id"], "Someday thing")

    digest = (await client.get("/api/workspaces/acme/digests/me/")).json()
    assert digest["total_open"] == 2
    keys = {s["key"]: s["count"] for s in digest["sections"]}
    assert keys.get("overdue") == 1
    assert keys.get("open") == 1
    # The overdue item carries a resolvable code + href.
    overdue = next(s for s in digest["sections"] if s["key"] == "overdue")
    assert overdue["items"][0]["code"].startswith("MBA-")
    assert overdue["items"][0]["href"]


async def test_ai_summary_is_opt_in_on_preview(client):
    # GIN-101: no AI note by default; ?ai=true fills it (canned via FakeProvider).
    me, project = await setup(client)
    await _assigned_story(client, project["id"], me["id"], "Work", "2020-01-01")

    plain = (await client.get("/api/workspaces/acme/digests/me/")).json()
    assert plain["ai_summary"] is None

    with_ai = (await client.get("/api/workspaces/acme/digests/me/?ai=true")).json()
    assert with_ai["ai_summary"]


async def test_run_is_idempotent_and_logs_delivery(client):
    me, project = await setup(client)
    await _assigned_story(client, project["id"], me["id"], "Work", "2020-01-01")

    first = (await client.post("/api/workspaces/acme/digests/run/")).json()
    assert first["sent"] == 1

    # A second run the same day delivers nothing new (idempotent per user/day).
    second = (await client.post("/api/workspaces/acme/digests/run/")).json()
    assert second["sent"] == 0

    deliveries = (await client.get("/api/workspaces/acme/digests/deliveries/")).json()
    assert len(deliveries) == 1
    assert deliveries[0]["status"] == "sent"
    assert deliveries[0]["item_count"] == 1
    assert "in_app" in deliveries[0]["channels"]


async def test_delivery_keeps_what_was_sent(client, db_session):
    """A digest is a point-in-time snapshot — the stories move on, so if the sent
    content isn't kept on the row it can't be reconstructed later.

    Reads via the `db_session` fixture, NOT the module-level `async_session()`:
    that one ignores the get_db override and talks to whatever DATABASE_URL says,
    which in this repo is prod.
    """
    from sqlalchemy import select

    from gigsnano_api.models import DigestDelivery

    me, project = await setup(client)
    await _assigned_story(client, project["id"], me["id"], "Work", "2020-01-01")
    assert (await client.post("/api/workspaces/acme/digests/run/")).json()["sent"] == 1

    row = (await db_session.execute(select(DigestDelivery))).scalars().one()
    assert row.body_html and "Work" in row.body_html  # the email verbatim, not a re-render
    assert row.subject

    # ai_summary is served on the log; body_html deliberately is not (500-row list).
    delivery = (await client.get("/api/workspaces/acme/digests/deliveries/")).json()[0]
    assert "ai_summary" in delivery
    assert "body_html" not in delivery


async def test_run_skips_users_with_nothing_pending(client):
    await setup(client)  # a user with no assigned work
    result = (await client.post("/api/workspaces/acme/digests/run/")).json()
    assert result["sent"] == 0
    assert result["skipped"] >= 1
    deliveries = (await client.get("/api/workspaces/acme/digests/deliveries/")).json()
    assert deliveries == []


async def test_preferences_default_and_update(client):
    await setup(client)
    prefs = (await client.get("/api/workspaces/acme/digests/preferences/")).json()
    assert prefs["enabled"] is True
    # A user with no preference row gets 09:00 Asia/Kolkata, not 09:00 UTC —
    # "9am" means 9am where the team is (see models/digests.py DEFAULT_TIMEZONE).
    assert prefs["timezone"] == "Asia/Kolkata"
    assert prefs["digest_hour"] == 9
    assert prefs["digest_weekdays"] == [0, 1, 2, 3, 4, 5, 6]
    assert set(prefs["channels"]) == {"email", "in_app"}

    updated = (
        await client.put(
            "/api/workspaces/acme/digests/preferences/",
            json={
                "enabled": False,
                "channels": ["in_app"],
                "timezone": "Asia/Kolkata",
                "digest_hour": 9,
                "digest_weekdays": [2],
            },
        )
    ).json()
    assert updated["enabled"] is False
    assert updated["channels"] == ["in_app"]
    assert updated["timezone"] == "Asia/Kolkata"
    assert updated["digest_hour"] == 9
    assert updated["digest_weekdays"] == [2]


def test_ai_note_meta_guard():
    """The AI focus note must never talk about itself.

    The shipped prompt really did produce "I need to see your work digest to
    write a focus note. Could you provide..." on short digests — the model
    mistaking two items for a truncated list and asking the reader for the rest.
    That went into a real email. The note is optional, so a note that talks about
    its own task is worse than no note.
    """
    from gigsnano_api.features.digests.ai import _is_meta

    # Real failures observed from the old prompt against prod digests.
    assert _is_meta("I need to see your work digest to write a focus note.")
    assert _is_meta("Could you provide your full daily work digest?")
    assert _is_meta("I don't have enough context about due dates.")
    assert _is_meta("Can you share the complete digest including blocked items?")
    assert _is_meta("")
    assert _is_meta("   ")
    # Anything that asks the reader a question is meta by construction — a focus
    # note states, it never asks.
    assert _is_meta("Should you start with the pipeline blocker?")

    # Real-shaped focus notes must survive.
    assert not _is_meta(
        "Start on getting access for Pipeline - Partner & Vendor Accounts since "
        "that's blocking other work."
    )
    assert not _is_meta("Start on GigsNano pagination — it's in progress and actively broken.")
    assert not _is_meta(
        "Start on GigsAI Screenshot & Auto-Attach to Work Items — it's marked high priority."
    )
    assert not _is_meta("Nothing is pressing today; pick up the onboarding brainstorm.")


async def test_preferences_reject_bad_timing(client):
    """Timing is validated at the edge — a bad zone/hour/day set here would be
    read by the scheduler on every tick forever."""
    await setup(client)
    for payload in (
        {"timezone": "Mars/Olympus_Mons"},
        {"digest_hour": 24},
        {"digest_hour": -1},
        {"digest_weekdays": []},
        {"digest_weekdays": [7]},
    ):
        r = await client.put("/api/workspaces/acme/digests/preferences/", json=payload)
        assert r.status_code == 422, f"{payload} should be rejected, got {r.status_code}"


async def test_preferences_weekdays_deduped_and_sorted(client):
    await setup(client)
    updated = (
        await client.put(
            "/api/workspaces/acme/digests/preferences/",
            json={"digest_weekdays": [4, 0, 4, 2]},
        )
    ).json()
    assert updated["digest_weekdays"] == [0, 2, 4]


async def test_disabled_user_skipped_in_run(client):
    me, project = await setup(client)
    await _assigned_story(client, project["id"], me["id"], "Work", "2020-01-01")
    await client.put("/api/workspaces/acme/digests/preferences/", json={"enabled": False})

    result = (await client.post("/api/workspaces/acme/digests/run/")).json()
    assert result["sent"] == 0
    assert (await client.get("/api/workspaces/acme/digests/deliveries/")).json() == []


async def test_channels_pref_limits_delivery(client):
    me, project = await setup(client)
    await _assigned_story(client, project["id"], me["id"], "Work", "2020-01-01")
    await client.put("/api/workspaces/acme/digests/preferences/", json={"channels": ["in_app"]})

    await client.post("/api/workspaces/acme/digests/run/")
    d = (await client.get("/api/workspaces/acme/digests/deliveries/")).json()[0]
    assert d["channels"] == ["in_app"]


async def test_status_pref_filters_items(client):
    me, project = await setup(client)
    todo = await _assigned_story(client, project["id"], me["id"], "Todo item")
    prog = await _assigned_story(client, project["id"], me["id"], "In progress item")
    await client.patch(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{prog['id']}/",
        json={"status": "in_progress"},
    )
    await client.put("/api/workspaces/acme/digests/preferences/", json={"statuses": ["in_progress"]})

    # Preview honors the same status filter via the run; check the run's item_count.
    await client.post("/api/workspaces/acme/digests/run/")
    d = (await client.get("/api/workspaces/acme/digests/deliveries/")).json()[0]
    assert d["item_count"] == 1


async def test_run_requires_admin(client):
    # Second (non-admin) member can't trigger a run.
    me, project = await setup(client)
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Bo", "email": "bo@example.test", "password": "s3cret!",
    })
    # Bo is signed in now (fresh session cookie); not a member of acme.
    res = await client.post("/api/workspaces/acme/digests/run/")
    assert res.status_code in (403, 404)


async def test_template_auto_selected_from_role(client):
    # GIN-102: the workspace creator is OWNER → manager template auto-selected.
    await setup(client)
    prefs = (await client.get("/api/workspaces/acme/digests/preferences/")).json()
    assert prefs["template"] == "manager"


async def test_template_reshapes_section_order(client):
    # GIN-102: the PM template leads with upcoming milestones (due_soon), relabeled.
    from datetime import date, timedelta

    me, project = await setup(client)
    soon = (date.today() + timedelta(days=2)).isoformat()
    await _assigned_story(client, project["id"], me["id"], "Overdue", "2020-01-01")
    await _assigned_story(client, project["id"], me["id"], "Upcoming", soon)
    await client.put("/api/workspaces/acme/digests/preferences/", json={"template": "pm"})

    digest = (await client.get("/api/workspaces/acme/digests/me/")).json()
    assert digest["sections"][0]["key"] == "due_soon"
    assert digest["sections"][0]["label"] == "Upcoming milestones"
    # Overdue still present, just after the milestones section.
    assert [s["key"] for s in digest["sections"]].index("overdue") > 0


async def test_open_and_click_tracking(client):
    me, project = await setup(client)
    await _assigned_story(client, project["id"], me["id"], "Work", "2020-01-01")
    await client.post("/api/workspaces/acme/digests/run/")
    delivery_id = (await client.get("/api/workspaces/acme/digests/deliveries/")).json()[0]["id"]

    px = await client.get(f"/api/digests/track/open/{delivery_id}/")
    assert px.status_code == 200
    assert px.headers["content-type"].startswith("image/gif")

    click = await client.get(
        f"/api/digests/track/click/{delivery_id}/?to=http://localhost:3000/acme/work-items",
        follow_redirects=False,
    )
    assert click.status_code == 302

    deliveries = (await client.get("/api/workspaces/acme/digests/deliveries/")).json()
    assert deliveries[0]["opened_at"] is not None
    assert deliveries[0]["clicked_at"] is not None


async def test_scheduler_survives_a_failing_tick(monkeypatch):
    """A tick that raises must not end the schedule.

    Prod regression (2026-07-17): a stale pooled connection raised
    InterfaceError("connection is closed") out of _run_all_workspaces, which
    killed the scheduler task outright. Nothing restarted it and nothing logged
    it, so every digest silently stopped while /health stayed green.
    """
    import asyncio

    from gigsnano_api.features.digests import scheduler as sched

    calls = []

    async def boom(provider, llm_provider=None, now_utc=None):
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError("connection is closed")

    monkeypatch.setattr(sched, "_run_all_workspaces", boom)
    monkeypatch.setattr(sched, "seconds_until_next_tick", lambda *a, **k: 0)

    task = asyncio.create_task(sched.digest_scheduler(None))
    for _ in range(100):  # bounded: a dead scheduler must fail, not hang the suite
        if len(calls) >= 3:
            break
        await asyncio.sleep(0)
    task.cancel()

    # First tick raises; ticks 2 and 3 prove the loop outlived it.
    assert len(calls) >= 3, f"scheduler stopped ticking after a failing tick ({calls=})"


async def test_scheduler_still_stops_on_cancel(monkeypatch):
    """The failing-tick guard must not swallow shutdown.

    CancelledError derives from BaseException, not Exception, so `except
    Exception` leaves it alone — this pins that, since catching it would hang
    the app's shutdown forever.
    """
    import asyncio

    from gigsnano_api.features.digests import scheduler as sched

    async def noop(provider, llm_provider=None, now_utc=None):
        return None

    monkeypatch.setattr(sched, "_run_all_workspaces", noop)
    monkeypatch.setattr(sched, "seconds_until_next_tick", lambda *a, **k: 0)

    task = asyncio.create_task(sched.digest_scheduler(None))
    await asyncio.sleep(0)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task


async def test_unsubscribed_user_gets_no_digest_email_but_keeps_in_app(client):
    """GIN-145: user.email_digest=False must suppress the digest EMAIL.

    Shipped broken: the unsubscribe link promises "you've been unsubscribed from
    notification emails", notify_from_template honoured it, and deliver_digest
    never read it — so unsubscribing silenced the one-off notifications and left
    the recurring digest still arriving. Verified live on prod 2026-07-17.
    """
    from gigsnano_api.email.provider import FakeEmailProvider

    me, project = await setup(client)
    await _assigned_story(client, project["id"], me["id"], "Work", "2020-01-01")

    await client.patch("/api/auth/me/", json={"email_digest": False})
    FakeEmailProvider.reset()
    await client.post("/api/workspaces/acme/digests/run/")

    to = [m["to"] for m in FakeEmailProvider.sent]
    assert me["email"] not in to, f"emailed an unsubscribed user: {to}"

    # The opt-out is about mail only — the in-app digest still lands, and the
    # delivery row must say what actually happened rather than claim an email.
    delivery = (await client.get("/api/workspaces/acme/digests/deliveries/")).json()[0]
    assert delivery["channels"] == ["in_app"]


async def test_subscribed_user_still_gets_the_digest_email(client):
    """The other half of GIN-145: the guard must not silence everyone."""
    from gigsnano_api.email.provider import FakeEmailProvider

    me, project = await setup(client)
    await _assigned_story(client, project["id"], me["id"], "Work", "2020-01-01")

    FakeEmailProvider.reset()
    await client.post("/api/workspaces/acme/digests/run/")

    assert me["email"] in [m["to"] for m in FakeEmailProvider.sent]
    delivery = (await client.get("/api/workspaces/acme/digests/deliveries/")).json()[0]
    assert "email" in delivery["channels"]
