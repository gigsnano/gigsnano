"""GIN-388: the daily control run, and the cursor feed that keeps it incremental.

The run's job is to be *checkable*: every finding names its evidence, every
proposal carries the policy verdict, and a run that applied nothing says so
rather than implying it decided nothing was wrong.
"""

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select

from gigsnano_api.models import Story


async def setup_project(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    return (await client.post("/api/workspaces/acme/projects/", json={
        "name": "Mobile App", "identifier": "MBA", "flow": "fresh",
        "cover_image_url": "https://img.test/c.jpg",
    })).json()


def base(project) -> str:
    return f"/api/workspaces/acme/projects/{project['id']}"


async def make_story(client, project, title, **fields):
    return (await client.post(
        f"{base(project)}/stories/", json={"title": title, **fields}
    )).json()


async def age_story(db_session, code: str, days: int):
    """Backdate updated_at so staleness is testable without waiting two weeks.
    Keyed on the work-item code, not sort_order — Sprint-0 seeding makes those
    two diverge, and matching on the wrong one silently ages nothing."""
    number = int(code.rsplit("-", 1)[1])
    story = (await db_session.execute(
        select(Story).where(Story.story_number == number)
    )).scalars().first()
    story.updated_at = datetime.now(timezone.utc) - timedelta(days=days)
    await db_session.commit()


async def test_a_run_records_findings_with_their_evidence(client):
    project = await setup_project(client)
    await make_story(client, project, "tbd")  # unready
    story = await make_story(client, project, "Load the warehouse")
    await client.post(f"{base(project)}/stories/{story['id']}/blockers/", json={
        "reason": "no tenant access", "external_dependency": "client IT",
        "expected_resolution_date": str(date.today() - timedelta(days=2)),
    })
    await client.post(f"{base(project)}/decisions/", json={
        "question": "Buy or build?", "due_date": str(date.today() - timedelta(days=1)),
    })
    await client.post(f"{base(project)}/escalations/", json={
        "title": "Tenant access", "category": "access",
    })

    run = (await client.post(f"{base(project)}/control-runs/", json={})).json()
    kinds = {f["kind"] for f in run["findings"]["items"]}
    assert {"backlog_readiness", "blocked_work", "blockers_overdue",
            "decisions_overdue", "escalations_open"} <= kinds
    # Every finding names what it is based on — a conclusion with no rows behind
    # it cannot be checked.
    assert all(f["evidence"] for f in run["findings"]["items"])
    assert run["correlation_id"] and run["status"] == "completed"


async def test_a_run_applies_nothing_and_says_so(client):
    project = await setup_project(client)
    story = await make_story(client, project, "Item", priority="low")
    run = (await client.post(f"{base(project)}/control-runs/", json={})).json()
    assert run["actions_executed"] == []
    assert run["model"] is None  # no model was called; do not imply one was
    fetched = (await client.get(
        f"/api/workspaces/acme/stories/resolve/{story['code']}"
    )).json()
    assert fetched["priority"] == "low"  # untouched


async def test_proposals_carry_the_policy_verdict(client, db_session):
    project = await setup_project(client)
    for i in range(3):
        s = await make_story(client, project, f"In flight {i}")
        await client.patch(f"{base(project)}/stories/{s['id']}/", json={"status": "in_progress"})
        await age_story(db_session, s["code"], days=40)

    # A limit low enough that the proposal cannot run unattended.
    await client.patch(f"{base(project)}/autonomy-policy/", json={"max_items_per_run": 1})
    run = (await client.post(f"{base(project)}/control-runs/", json={})).json()

    stale = next(f for f in run["findings"]["items"] if f["kind"] == "stale_in_flight")
    assert stale["evidence"]
    proposed = [a for a in run["actions_proposed"] if a["action"] == "change_status"]
    assert proposed, "a stalled-work proposal should have been made"
    awaiting = [a for a in run["actions_awaiting_approval"] if a["action"] == "change_status"]
    assert awaiting and awaiting[0]["policy"]["requires_approval"] is True
    assert "exceeds the limit" in awaiting[0]["policy"]["summary"]


async def test_a_paused_director_still_analyses_but_nothing_is_within_policy(client, db_session):
    project = await setup_project(client)
    s = await make_story(client, project, "In flight")
    await client.patch(f"{base(project)}/stories/{s['id']}/", json={"status": "in_progress"})
    await age_story(db_session, s["code"], days=40)
    await client.post(f"{base(project)}/autonomy-policy/pause/", json={"reason": "incident"})

    run = (await client.post(f"{base(project)}/control-runs/", json={})).json()
    assert run["findings"]["items"], "observation must keep working while paused"
    assert run["actions_within_policy"] == []
    assert all(
        "paused" in a["policy"]["summary"] for a in run["actions_awaiting_approval"]
    )


async def test_runs_chain_their_windows(client):
    project = await setup_project(client)
    first = (await client.post(f"{base(project)}/control-runs/", json={})).json()
    second = (await client.post(f"{base(project)}/control-runs/", json={})).json()
    assert first["window_from"] is None  # nothing before it
    # SQLite drops the tz suffix on the round-trip; the instant is what matters.
    assert second["window_from"].rstrip("Z") == first["window_to"].rstrip("Z")
    listing = (await client.get(f"{base(project)}/control-runs/")).json()
    assert [r["id"] for r in listing["items"]] == [second["id"], first["id"]]


async def test_change_feed_is_incremental_and_the_cursor_holds_when_empty(client):
    project = await setup_project(client)
    await make_story(client, project, "First")
    initial = (await client.get(f"{base(project)}/changes/")).json()
    assert initial["returned"] >= 1
    cursor = initial["cursor"]

    nothing_new = (await client.get(f"{base(project)}/changes/?since={cursor}")).json()
    assert nothing_new["returned"] == 0
    # The cursor must not advance past events nobody has seen.
    assert nothing_new["cursor"] == cursor

    await make_story(client, project, "Second")
    after = (await client.get(f"{base(project)}/changes/?since={cursor}")).json()
    assert after["returned"] >= 1 and after["cursor"] != cursor


async def test_stale_list_only_counts_work_in_flight(client, db_session):
    project = await setup_project(client)
    idle_backlog = await make_story(client, project, "Backlog item nobody touched")
    await age_story(db_session, idle_backlog["code"], days=60)
    active = await make_story(client, project, "Started but stalled")
    await client.patch(f"{base(project)}/stories/{active['id']}/", json={"status": "in_progress"})
    await age_story(db_session, active["code"], days=60)

    stale = (await client.get(f"{base(project)}/stale-work-items/")).json()
    codes = {i["code"] for i in stale["items"]}
    assert active["code"] in codes
    assert idle_backlog["code"] not in codes  # a backlog item is not "stalled"


async def test_today_plan_groups_by_owner_and_flags_blocked(client):
    project = await setup_project(client)
    mine = await make_story(client, project, "Mine")
    await client.patch(f"{base(project)}/stories/{mine['id']}/", json={"status": "in_progress"})
    await client.post(f"{base(project)}/stories/{mine['id']}/blockers/", json={
        "reason": "waiting", "external_dependency": "vendor",
    })
    plan = (await client.get(f"{base(project)}/today-plan/")).json()
    owner = plan["owners"][0]
    assert owner["in_flight"] == 1 and owner["blocked"] == 1
    assert owner["items"][0]["code"] == mine["code"]
