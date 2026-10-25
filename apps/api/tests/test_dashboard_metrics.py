from datetime import datetime, timedelta, timezone

CREATE_PROJECT = {
    "name": "Mobile App", "identifier": "MBA", "flow": "fresh",
    "cover_image_url": "https://img.test/c.jpg",
}


async def setup_project(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    return (
        await client.post("/api/workspaces/acme/projects/", json=CREATE_PROJECT)
    ).json()


async def test_metrics_shape_and_totals(client):
    project = await setup_project(client)  # seeds Sprint-0 stories
    m = (await client.get("/api/workspaces/acme/dashboards/metrics/")).json()

    assert set(m) == {
        "total", "open", "status_counts", "priority_counts", "assignee_counts",
        "assignee_status_counts", "label_counts",
    }
    # every status/priority enum key present (seeded 0 where absent)
    assert set(m["status_counts"]) == {"todo", "in_progress", "in_review", "done"}
    assert set(m["priority_counts"]) == {"urgent", "high", "medium", "low", "none"}

    assert m["total"] > 0
    assert sum(m["status_counts"].values()) == m["total"]
    assert m["open"] == m["total"] - m["status_counts"]["done"]


async def test_metrics_reflects_completion_and_status_filter(client):
    project = await setup_project(client)
    pid = project["id"]
    stories = (
        await client.get(f"/api/workspaces/acme/projects/{pid}/sprint-zero/stories/")
    ).json()
    # the first (unlocked) card can be completed
    track = next(s for s in stories if s["bmad"] and s["bmad"]["workflow"] == "track-selection")
    await client.patch(
        f"/api/workspaces/acme/projects/{pid}/stories/{track['id']}/", json={"status": "done"}
    )

    m = (await client.get("/api/workspaces/acme/dashboards/metrics/")).json()
    assert m["status_counts"]["done"] >= 1

    # status filter narrows every dimension to that slice
    done_only = (
        await client.get("/api/workspaces/acme/dashboards/metrics/?status=done")
    ).json()
    assert done_only["total"] == m["status_counts"]["done"]
    assert done_only["status_counts"]["todo"] == 0


async def test_metrics_owner_scoped_to_workspace(client):
    await setup_project(client)
    # a second workspace with no projects has zero metrics
    await client.post("/api/workspaces/", json={"name": "Beta", "slug": "beta"})
    m = (await client.get("/api/workspaces/beta/dashboards/metrics/")).json()
    assert m["total"] == 0
    assert m["open"] == 0


# --- GIN-160: date range + per-assignee status cross-tab -----------------------


async def test_assignee_status_counts_cross_tab(client):
    """Each assignee row carries a full status breakdown, unassigned included."""
    project = await setup_project(client)
    pid = project["id"]
    m = (await client.get("/api/workspaces/acme/dashboards/metrics/")).json()

    # Sprint-0 seeds unassigned stories, so that bucket must exist and be complete.
    assert "unassigned" in m["assignee_status_counts"]
    row = m["assignee_status_counts"]["unassigned"]
    assert set(row) == {"todo", "in_progress", "in_review", "done"}

    # The cross-tab must reconcile with the flat counts it refines.
    for key, total in m["assignee_counts"].items():
        assert sum(m["assignee_status_counts"][key].values()) == total
    assert sum(sum(r.values()) for r in m["assignee_status_counts"].values()) == m["total"]


async def test_metrics_date_range_filters_by_creation(client):
    await setup_project(client)
    today = datetime.now(timezone.utc).date()  # match the endpoint UTC-day contract (GIN-255)

    # A window ending before anything existed is empty...
    old = (
        await client.get(
            "/api/workspaces/acme/dashboards/metrics/"
            f"?date_from={today - timedelta(days=30)}&date_to={today - timedelta(days=1)}"
        )
    ).json()
    assert old["total"] == 0
    assert old["assignee_status_counts"] == {}

    # ...and one that includes today sees the seeded Sprint-0 stories. date_to is
    # inclusive of its whole day, so "today to today" must not be empty.
    now = (
        await client.get(
            f"/api/workspaces/acme/dashboards/metrics/?date_from={today}&date_to={today}"
        )
    ).json()
    assert now["total"] > 0

    # Absent params still mean all-time (existing widgets must not change).
    assert (
        await client.get("/api/workspaces/acme/dashboards/metrics/")
    ).json()["total"] == now["total"]


async def test_activity_zero_fills_window_and_counts_events(client):
    """GIN-527: activity is what happened — created, updated, completed."""
    project = await setup_project(client)
    pid = project["id"]
    today = datetime.now(timezone.utc).date()  # match the endpoint UTC-day contract (GIN-255)

    stories = (
        await client.get(f"/api/workspaces/acme/projects/{pid}/sprint-zero/stories/")
    ).json()
    track = next(s for s in stories if s["bmad"] and s["bmad"]["workflow"] == "track-selection")
    await client.patch(
        f"/api/workspaces/acme/projects/{pid}/stories/{track['id']}/", json={"status": "done"}
    )

    a = (
        await client.get(
            "/api/workspaces/acme/dashboards/activity/"
            f"?date_from={today - timedelta(days=6)}&date_to={today}"
        )
    ).json()

    # One point per day, oldest first, no gaps.
    assert len(a["daily"]) == 7
    assert [p["date"] for p in a["daily"]] == [
        str(today - timedelta(days=i)) for i in range(6, -1, -1)
    ]
    assert a["period_from"] == str(today - timedelta(days=6))
    assert a["period_to"] == str(today)
    assert a["bucket"] == "day"

    now = a["daily"][-1]
    assert now["created"] > 0  # Sprint-0 seed landed today
    assert now["completed"] == 1  # the one transition we just made
    # Closing an item is also a change to it, so completed is inside updated.
    assert now["updated"] >= now["completed"]
    # A day with no events reports zero rather than being omitted.
    assert a["daily"][0] == {
        "date": str(today - timedelta(days=6)),
        "created": 0, "updated": 0, "completed": 0,
    }


async def test_activity_scheduled_dates_are_not_activity(client):
    """A start/target date is a plan, not an event: setting one must not move the
    activity chart on that future day. (It does log an `updated` today.)"""
    project = await setup_project(client)
    pid = project["id"]
    today = datetime.now(timezone.utc).date()
    due = today + timedelta(days=3)

    stories = (
        await client.get(f"/api/workspaces/acme/projects/{pid}/sprint-zero/stories/")
    ).json()
    await client.patch(
        f"/api/workspaces/acme/projects/{pid}/stories/{stories[0]['id']}/",
        json={"start_date": str(today + timedelta(days=1)), "target_date": str(due)},
    )

    a = (
        await client.get(
            f"/api/workspaces/acme/dashboards/activity/?date_from={today}&date_to={due}"
        )
    ).json()
    future = {p["date"]: p for p in a["daily"]}[str(due)]
    assert future == {"date": str(due), "created": 0, "updated": 0, "completed": 0}


async def test_planned_workload_reports_schedule_not_events(client):
    project = await setup_project(client)
    pid = project["id"]
    today = datetime.now(timezone.utc).date()
    starts = today + timedelta(days=1)
    due = today + timedelta(days=3)

    stories = (
        await client.get(f"/api/workspaces/acme/projects/{pid}/sprint-zero/stories/")
    ).json()
    await client.patch(
        f"/api/workspaces/acme/projects/{pid}/stories/{stories[0]['id']}/",
        json={"start_date": str(starts), "target_date": str(due)},
    )

    p = (
        await client.get(
            f"/api/workspaces/acme/dashboards/planned/?date_from={today}&date_to={due}"
        )
    ).json()
    by_day = {row["date"]: row for row in p["daily"]}
    assert by_day[str(starts)]["starting"] == 1
    assert by_day[str(due)]["due"] == 1
    # Not yet late, and items with no dates land in no series at all.
    assert by_day[str(due)]["overdue"] == 0
    assert by_day[str(today)] == {"date": str(today), "starting": 0, "due": 0, "overdue": 0}


async def test_planned_workload_overdue_excludes_settled_work(client):
    """Two items were due yesterday; the one that shipped is history, not risk."""
    project = await setup_project(client)
    pid = project["id"]
    today = datetime.now(timezone.utc).date()
    yesterday = today - timedelta(days=1)

    stories = (
        await client.get(f"/api/workspaces/acme/projects/{pid}/sprint-zero/stories/")
    ).json()
    for story in stories[:2]:
        await client.patch(
            f"/api/workspaces/acme/projects/{pid}/stories/{story['id']}/",
            json={"target_date": str(yesterday)},
        )
    await client.patch(
        f"/api/workspaces/acme/projects/{pid}/stories/{stories[0]['id']}/",
        json={"status": "done"},
    )

    p = (
        await client.get(
            f"/api/workspaces/acme/dashboards/planned/?date_from={yesterday}&date_to={today}"
        )
    ).json()
    late = {row["date"]: row for row in p["daily"]}[str(yesterday)]
    assert late["due"] == 2
    assert late["overdue"] == 1


async def test_weekly_bucket_folds_days_into_periods(client):
    """A 90-day window is unreadable as 90 columns, so it can be asked for by
    week. Each point is the week's first day, clamped to the window start."""
    await setup_project(client)
    today = datetime.now(timezone.utc).date()
    from_ = today - timedelta(days=20)

    daily, weekly = [
        (
            await client.get(
                f"/api/workspaces/acme/dashboards/activity/"
                f"?date_from={from_}&date_to={today}&bucket={b}"
            )
        ).json()
        for b in ("day", "week")
    ]

    assert len(daily["daily"]) == 21
    assert weekly["bucket"] == "week"
    assert len(weekly["daily"]) < len(daily["daily"])
    # The first period starts at the window edge, never before it.
    assert weekly["daily"][0]["date"] == str(from_)
    # Every later period starts on a Monday.
    assert all(
        datetime.fromisoformat(p["date"]).weekday() == 0 for p in weekly["daily"][1:]
    )
    # Folding redistributes days but invents and drops nothing.
    for key in ("created", "updated", "completed"):
        assert sum(p[key] for p in weekly["daily"]) == sum(p[key] for p in daily["daily"])


async def test_activity_rejects_bad_windows(client):
    await setup_project(client)
    today = datetime.now(timezone.utc).date()  # match the endpoint UTC-day contract (GIN-255)

    inverted = await client.get(
        f"/api/workspaces/acme/dashboards/activity/?date_from={today}&date_to={today - timedelta(days=1)}"
    )
    assert inverted.status_code == 422

    # Unbounded windows would zero-fill an arbitrarily long list.
    huge = await client.get(
        f"/api/workspaces/acme/dashboards/activity/?date_from={today - timedelta(days=400)}&date_to={today}"
    )
    assert huge.status_code == 422


async def test_activity_scoped_to_workspace(client):
    await setup_project(client)
    await client.post("/api/workspaces/", json={"name": "Beta", "slug": "beta"})
    a = (await client.get("/api/workspaces/beta/dashboards/activity/")).json()
    assert len(a["daily"]) == 30  # default window, still zero-filled
    assert all(
        p["created"] == 0 and p["updated"] == 0 and p["completed"] == 0 for p in a["daily"]
    )
