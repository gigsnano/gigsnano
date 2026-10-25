from datetime import date, timedelta

import httpx

from gigsnano_api.core.db import utcnow
from gigsnano_api.features.reports.service import bucket_starts, on_time_pct, resolve_range
from gigsnano_api.models import (
    Cycle,
    ECycleStatus,
    EMemberStatus,
    EProjectRole,
    EWorkspaceRole,
    ForecastSnapshot,
    ProjectMember,
    Story,
    WorkspaceMember,
)

OWNER = {"display_name": "Owner", "email": "owner@example.test", "password": "s3cret!"}
MEMBER = {"display_name": "Mia", "email": "mia@example.test", "password": "s3cret!"}
TODAY = date(2026, 10, 17)  # a Saturday


def _project(name: str, identifier: str) -> dict:
    return {"name": name, "identifier": identifier, "flow": "fresh",
            "cover_image_url": "https://img.test/c.jpg"}


async def _setup(client):
    await client.post("/api/auth/sign-up/", json=OWNER)
    ws = (await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})).json()
    a = (await client.post("/api/workspaces/acme/projects/", json=_project("Alpha", "ALP"))).json()
    b = (await client.post("/api/workspaces/acme/projects/", json=_project("Beta", "BET"))).json()
    return ws, a["id"], b["id"]


async def _stories(client, pid) -> list[dict]:
    return (await client.get(f"/api/workspaces/acme/projects/{pid}/sprint-zero/stories/")).json()


async def _patch(client, pid, sid, **body):
    res = await client.patch(f"/api/workspaces/acme/projects/{pid}/stories/{sid}/", json=body)
    assert res.status_code == 200, res.text


async def _reports(c, **params) -> dict:
    res = await c.get("/api/workspaces/acme/reports/", params=params)
    assert res.status_code == 200, res.text
    return res.json()


# --- pure rules ---------------------------------------------------------------

def test_resolve_range():
    assert resolve_range("7d", TODAY) == (date(2026, 10, 11), TODAY, "day")
    assert resolve_range("30d", TODAY) == (date(2026, 9, 18), TODAY, "day")
    assert resolve_range("quarter", TODAY) == (date(2026, 7, 20), TODAY, "week")


def test_bucket_starts_day_and_week():
    assert len(bucket_starts(date(2026, 10, 11), TODAY, "day")) == 7
    weeks = bucket_starts(date(2026, 10, 14), date(2026, 10, 28), "week")  # starts Wednesday
    assert weeks == [date(2026, 10, 12), date(2026, 10, 19), date(2026, 10, 26)]
    q = bucket_starts(*resolve_range("quarter", TODAY)[:2], "week")
    assert q[0] == date(2026, 7, 20) and q[-1] == date(2026, 10, 12)


def test_on_time_pct():
    assert on_time_pct(0, 0) is None
    assert on_time_pct(3, 1) == 33
    assert on_time_pct(2, 2) == 100


# --- endpoint -----------------------------------------------------------------

async def test_reports_shape(client):
    await _setup(client)
    body = await _reports(client)
    assert set(body) == {"range", "period_from", "period_to", "bucket", "throughput",
                         "on_time", "at_risk", "team_load", "cycles"}
    assert body["range"] == "7d" and body["bucket"] == "day"
    assert set(body["throughput"]) == {"total", "previous_total", "buckets"}
    assert len(body["throughput"]["buckets"]) == 7
    assert set(body["on_time"]) == {"done_with_target", "on_time", "pct", "previous_pct"}
    assert set(body["at_risk"]) == {"at_risk", "off_track", "total_projects"}
    assert body["at_risk"]["total_projects"] == 2
    assert (await _reports(client, range="quarter"))["bucket"] == "week"


async def test_reports_bad_range_422(client):
    await _setup(client)
    res = await client.get("/api/workspaces/acme/reports/", params={"range": "bad"})
    assert res.status_code == 422


async def test_throughput_counts_reopened_story_once(client):
    _, a, _ = await _setup(client)
    s1, s2 = (await _stories(client, a))[:2]
    await _patch(client, a, s1["id"], status="done")
    await _patch(client, a, s1["id"], status="todo")
    await _patch(client, a, s1["id"], status="done")
    await _patch(client, a, s2["id"], status="done")

    body = await _reports(client)
    assert body["throughput"]["total"] == 2
    assert sum(b["completed"] for b in body["throughput"]["buckets"]) == 2
    assert body["throughput"]["previous_total"] == 0


async def test_on_time(client):
    _, a, _ = await _setup(client)
    s1, s2, s3 = (await _stories(client, a))[:3]
    today = utcnow().date()
    await _patch(client, a, s1["id"], status="done", target_date=str(today + timedelta(days=3)))
    await _patch(client, a, s2["id"], status="done", target_date=str(today - timedelta(days=3)))
    await _patch(client, a, s3["id"], status="done")

    on_time = (await _reports(client))["on_time"]
    assert on_time == {"done_with_target": 2, "on_time": 1, "pct": 50, "previous_pct": None}


async def test_team_load(client):
    _, a, _ = await _setup(client)
    owner_id = (await client.get("/api/auth/me/")).json()["id"]
    stories = await _stories(client, a)
    await _patch(client, a, stories[0]["id"], assignee_id=owner_id)
    await _patch(client, a, stories[1]["id"], assignee_id=owner_id)

    load = {t["display_name"]: t for t in (await _reports(client, project_ids=a))["team_load"]}
    assert load["Owner"]["open"] == 2 and load["Owner"]["user_id"] == owner_id
    assert load["Unassigned"]["open"] == len(stories) - 2
    assert load["Unassigned"]["user_id"] is None


async def test_cycles_pct_and_sprint_zero_excluded(client, db_session):
    _, a, _ = await _setup(client)
    stories = await _stories(client, a)
    cycle = Cycle(project_id=a, name="Cycle 1", status=ECycleStatus.ACTIVE)
    db_session.add(cycle)
    await db_session.commit()
    for s in stories[:4]:
        row = await db_session.get(Story, s["id"])
        row.cycle_id = cycle.id
    await db_session.commit()
    await _patch(client, a, stories[0]["id"], status="done")

    cycles = (await _reports(client))["cycles"]
    assert [c["cycle_name"] for c in cycles] == ["Cycle 1"]  # sprint-zero excluded
    c = cycles[0]
    assert (c["total"], c["done"], c["pct"], c["status"]) == (4, 1, 25, "active")
    assert c["project_name"] == "Alpha"


async def test_at_risk_counts_and_unknown_health(client, db_session):
    _, a, b = await _setup(client)
    for pid, health in ((a, "at_risk"), (b, "weird")):
        db_session.add(ForecastSnapshot(project_id=pid, calculated_at=utcnow(),
                                        algorithm_version="t", confidence="low",
                                        data_quality="ok", health_status=health))
    await db_session.commit()
    assert (await _reports(client))["at_risk"] == {
        "at_risk": 1, "off_track": 0, "total_projects": 2}


async def test_member_of_a_sees_nothing_from_b(app, client, db_session):
    ws, a, b = await _setup(client)
    b_story = (await _stories(client, b))[0]
    await _patch(client, b, b_story["id"], status="done",
                 target_date=str(utcnow().date() + timedelta(days=1)))
    db_session.add_all([
        Cycle(project_id=b, name="B cycle", status=ECycleStatus.ACTIVE),
        ForecastSnapshot(project_id=b, calculated_at=utcnow(), algorithm_version="t",
                         confidence="low", data_quality="ok", health_status="off_track"),
    ])
    await db_session.commit()
    a_total = len(await _stories(client, a))

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as mc:
        member = (await mc.post("/api/auth/sign-up/", json=MEMBER)).json()
        db_session.add_all([
            WorkspaceMember(workspace_id=ws["id"], user_id=member["id"],
                            role=EWorkspaceRole.MEMBER, status=EMemberStatus.ACTIVE),
            ProjectMember(project_id=a, user_id=member["id"],
                          role=EProjectRole.MEMBER, status=EMemberStatus.ACTIVE),
        ])
        await db_session.commit()
        body = await _reports(mc)
        assert body["throughput"]["total"] == 0
        assert body["on_time"]["done_with_target"] == 0
        assert body["cycles"] == []
        assert body["at_risk"] == {"at_risk": 0, "off_track": 0, "total_projects": 1}
        assert sum(t["open"] for t in body["team_load"]) == a_total

        only_b = await _reports(mc, project_ids=b)  # asking for B narrows to nothing
        assert only_b["at_risk"]["total_projects"] == 0
        assert only_b["team_load"] == [] and only_b["cycles"] == []
        assert only_b["throughput"]["total"] == 0
