from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

import httpx

from gigsnano_api.core.db import utcnow
from gigsnano_api.features.briefing.service import cycle_days_left, resolve_since, slip_days
from gigsnano_api.models import (
    Cycle,
    ECycleStatus,
    EMemberStatus,
    EProjectRole,
    EWorkspaceRole,
    ForecastSnapshot,
    Project,
    ProjectMember,
    WorkspaceMember,
)

OWNER = {"display_name": "Owner", "email": "owner@example.test", "password": "s3cret!"}
MEMBER = {"display_name": "Mia", "email": "mia@example.test", "password": "s3cret!"}
NOW = datetime(2026, 10, 17, 9, 0, tzinfo=timezone.utc)


def _project(name: str, identifier: str) -> dict:
    return {"name": name, "identifier": identifier, "flow": "fresh",
            "cover_image_url": "https://img.test/c.jpg"}


async def _setup(client) -> tuple[dict, dict]:
    await client.post("/api/auth/sign-up/", json=OWNER)
    ws = (await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})).json()
    a = (await client.post("/api/workspaces/acme/projects/", json=_project("Alpha", "ALP"))).json()
    b = (await client.post("/api/workspaces/acme/projects/", json=_project("Beta", "BET"))).json()
    return ws, {"a": a, "b": b}


# --- pure rules ---------------------------------------------------------------

def test_resolve_since_defaults_to_24h():
    assert resolve_since(None, NOW) == NOW - timedelta(hours=24)


def test_resolve_since_treats_naive_as_utc():
    assert resolve_since(datetime(2026, 10, 16, 9, 0), NOW) == NOW - timedelta(days=1)


def test_resolve_since_clamps_to_30_days():
    assert resolve_since(datetime(2020, 1, 1, tzinfo=timezone.utc), NOW) == NOW - timedelta(days=30)


def test_slip_days():
    assert slip_days(date(2026, 11, 1), datetime(2026, 11, 7, tzinfo=timezone.utc)) == 6
    assert slip_days(date(2026, 11, 1), datetime(2026, 10, 30, tzinfo=timezone.utc)) == -2
    assert slip_days(date(2026, 11, 1), None) is None


def test_cycle_days_left():
    today = date(2026, 10, 17)
    assert cycle_days_left(SimpleNamespace(start_date=None, end_date=date(2026, 10, 21)), today) == 4
    assert cycle_days_left(SimpleNamespace(start_date=date(2026, 10, 10), end_date=None), today) == 7
    assert cycle_days_left(SimpleNamespace(start_date=None, end_date=date(2026, 10, 1)), today) == 0


# --- endpoint -----------------------------------------------------------------

async def test_briefing_owner_sees_all_projects(client):
    await _setup(client)
    body = (await client.get("/api/workspaces/acme/briefing/")).json()

    assert {p["name"] for p in body["projects"]} == {"Alpha", "Beta"}
    assert set(body) == {"generated_at", "since", "needs_you", "projects"}
    assert set(body["needs_you"]) == {"approvals", "escalations", "assigned", "total"}
    p = body["projects"][0]
    assert set(p) == {
        "id", "name", "identifier", "logo_emoji", "progress_pct", "total", "done", "health",
        "target_date", "forecast_date", "slip_days", "cycle", "changes",
    }
    assert set(p["changes"]) == {"done", "created", "overdue", "docs_finalized"}


async def test_briefing_progress_and_done_since(client):
    _, projects = await _setup(client)
    pid = projects["a"]["id"]
    stories = (await client.get(
        f"/api/workspaces/acme/projects/{pid}/sprint-zero/stories/")).json()
    first = next(s for s in stories if s["bmad"] and s["bmad"]["workflow"] == "track-selection")
    await client.patch(f"/api/workspaces/acme/projects/{pid}/stories/{first['id']}/",
                       json={"status": "done"})

    hour_ago = (utcnow() - timedelta(hours=1)).isoformat()
    body = (await client.get("/api/workspaces/acme/briefing/", params={"since": hour_ago})).json()
    alpha = next(p for p in body["projects"] if p["id"] == pid)
    assert alpha["done"] == 1
    assert alpha["total"] == len(stories)
    assert alpha["progress_pct"] == round(100 / len(stories))
    assert alpha["changes"]["done"] == 1

    later = (utcnow() + timedelta(minutes=1)).isoformat()
    body = (await client.get("/api/workspaces/acme/briefing/", params={"since": later})).json()
    alpha = next(p for p in body["projects"] if p["id"] == pid)
    assert alpha["changes"]["done"] == 0


async def test_briefing_health_slip_and_order(client, db_session):
    _, projects = await _setup(client)
    a, b = projects["a"]["id"], projects["b"]["id"]
    project_a = await db_session.get(Project, a)
    project_a.target_date = date(2026, 11, 1)
    db_session.add_all([
        ForecastSnapshot(project_id=a, calculated_at=utcnow() - timedelta(days=2),
                         algorithm_version="t", confidence="low", data_quality="ok",
                         health_status="on_track", p85_date=datetime(2026, 10, 30, tzinfo=timezone.utc)),
        ForecastSnapshot(project_id=a, calculated_at=utcnow(),
                         algorithm_version="t", confidence="medium", data_quality="ok",
                         health_status="at_risk", p85_date=datetime(2026, 11, 7, tzinfo=timezone.utc)),
        ForecastSnapshot(project_id=b, calculated_at=utcnow(),
                         algorithm_version="t", confidence="high", data_quality="ok",
                         health_status=None),
    ])
    await db_session.commit()

    body = (await client.get("/api/workspaces/acme/briefing/")).json()
    assert [p["name"] for p in body["projects"]] == ["Alpha", "Beta"]  # at_risk before no_data
    alpha, beta = body["projects"]
    assert alpha["health"] == "at_risk"  # the latest snapshot wins
    assert alpha["slip_days"] == 6
    assert alpha["forecast_date"].startswith("2026-11-07")
    assert beta["health"] == "no_data"
    assert beta["slip_days"] is None


async def test_briefing_current_cycle(client, db_session):
    _, projects = await _setup(client)
    a = projects["a"]["id"]
    today = utcnow().date()
    db_session.add(Cycle(project_id=a, name="Cycle 3", status=ECycleStatus.ACTIVE,
                         start_date=today + timedelta(days=365), end_date=today + timedelta(days=370)))
    await db_session.commit()

    alpha = next(p for p in (await client.get("/api/workspaces/acme/briefing/")).json()["projects"]
                 if p["id"] == a)
    assert alpha["cycle"]["name"] == "Cycle 3"  # latest-starting active cycle
    assert alpha["cycle"]["days_left"] == 370


async def test_briefing_excludes_deleted_and_invisible(app, client, db_session):
    ws, projects = await _setup(client)
    a = projects["a"]["id"]
    stories = (await client.get(f"/api/workspaces/acme/projects/{a}/sprint-zero/stories/")).json()
    await client.delete(f"/api/workspaces/acme/projects/{a}/stories/{stories[-1]['id']}/")

    alpha = next(p for p in (await client.get("/api/workspaces/acme/briefing/")).json()["projects"]
                 if p["id"] == a)
    assert alpha["total"] == len(stories) - 1

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as member_client:
        member = (await member_client.post("/api/auth/sign-up/", json=MEMBER)).json()
        db_session.add_all([
            WorkspaceMember(workspace_id=ws["id"], user_id=member["id"],
                            role=EWorkspaceRole.MEMBER, status=EMemberStatus.ACTIVE),
            ProjectMember(project_id=a, user_id=member["id"],
                          role=EProjectRole.MEMBER, status=EMemberStatus.ACTIVE),
        ])
        await db_session.commit()
        body = (await member_client.get("/api/workspaces/acme/briefing/")).json()

    assert [p["name"] for p in body["projects"]] == ["Alpha"]


async def test_briefing_admin_without_project_rows_sees_all(app, client, db_session):
    ws, _ = await _setup(client)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as admin_client:
        admin = (await admin_client.post("/api/auth/sign-up/", json=MEMBER)).json()
        db_session.add(WorkspaceMember(workspace_id=ws["id"], user_id=admin["id"],
                                       role=EWorkspaceRole.ADMIN, status=EMemberStatus.ACTIVE))
        await db_session.commit()
        body = (await admin_client.get("/api/workspaces/acme/briefing/")).json()

    assert {p["name"] for p in body["projects"]} == {"Alpha", "Beta"}


async def test_briefing_member_sees_nothing_from_other_project(app, client, db_session):
    from gigsnano_api.models import (
        ENotificationKind,
        EPlanStatus,
        Notification,
        RecoveryPlan,
    )

    ws, projects = await _setup(client)
    a, b = projects["a"]["id"], projects["b"]["id"]
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as member_client:
        member = (await member_client.post("/api/auth/sign-up/", json=MEMBER)).json()
        db_session.add_all([
            WorkspaceMember(workspace_id=ws["id"], user_id=member["id"],
                            role=EWorkspaceRole.MEMBER, status=EMemberStatus.ACTIVE),
            ProjectMember(project_id=a, user_id=member["id"],
                          role=EProjectRole.MEMBER, status=EMemberStatus.ACTIVE),
            RecoveryPlan(project_id=b, title="Plan B", summary="", status=EPlanStatus.DRAFT),
            Notification(receiver_id=member["id"], workspace_id=ws["id"], project_id=b,
                         kind=ENotificationKind.ASSIGNMENT, title="B item", body="", read=False),
        ])
        await db_session.commit()
        body = (await member_client.get("/api/workspaces/acme/briefing/")).json()

    assert [p["name"] for p in body["projects"]] == ["Alpha"]
    assert body["needs_you"] == {"approvals": 0, "escalations": 0, "assigned": 0, "total": 0}


async def test_briefing_unknown_health_maps_to_no_data(client, db_session):
    _, projects = await _setup(client)
    a = projects["a"]["id"]
    db_session.add(ForecastSnapshot(project_id=a, calculated_at=utcnow(), algorithm_version="t",
                                    confidence="low", data_quality="ok", health_status="weird"))
    await db_session.commit()

    res = await client.get("/api/workspaces/acme/briefing/")
    assert res.status_code == 200
    alpha = next(p for p in res.json()["projects"] if p["id"] == a)
    assert alpha["health"] == "no_data"
