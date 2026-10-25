"""GIN-386: risks, decisions and escalations as records rather than prose."""

from datetime import date, timedelta


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


# ── risks ─────────────────────────────────────────────────────────────────────

async def test_risk_exposure_is_stored_and_recomputed(client):
    project = await setup_project(client)
    risk = (await client.post(f"{base(project)}/risks/", json={
        "title": "Fabric capacity may not be provisioned in time",
        "category": "external", "probability": 4, "impact": 5,
        "trigger": "No capacity SKU assigned by 1 Aug",
    })).json()
    assert risk["exposure"] == 20 and risk["status"] == "open"

    lowered = (await client.patch(
        f"{base(project)}/risks/{risk['id']}/", json={"probability": 1}
    )).json()
    assert lowered["exposure"] == 5  # stored, so it must move when a factor moves


async def test_register_is_ordered_by_exposure_with_counts(client):
    project = await setup_project(client)
    await client.post(f"{base(project)}/risks/", json={
        "title": "Small", "probability": 1, "impact": 1,
    })
    await client.post(f"{base(project)}/risks/", json={
        "title": "Large", "probability": 5, "impact": 5,
        "due_date": str(date.today() - timedelta(days=1)),
    })
    listing = (await client.get(f"{base(project)}/risks/")).json()
    assert [r["title"] for r in listing["items"]] == ["Large", "Small"]
    assert listing["highest_exposure"] == 25
    assert listing["open"] == 2 and listing["overdue"] == 1


async def test_a_risk_that_happened_is_distinct_from_one_avoided(client):
    project = await setup_project(client)
    risk = (await client.post(f"{base(project)}/risks/", json={"title": "Vendor slips"})).json()
    closed = (await client.post(f"{base(project)}/risks/{risk['id']}/close/", json={
        "note": "vendor missed the date", "occurred": True,
    })).json()
    assert closed["status"] == "occurred" and closed["closure_note"]

    again = await client.post(f"{base(project)}/risks/{risk['id']}/close/", json={})
    assert again.status_code == 409
    assert again.json()["detail"]["error_code"] == "risk_already_closed"


# ── decisions ─────────────────────────────────────────────────────────────────

OPTIONS = [
    {"key": "profisee", "summary": "Buy Profisee MDM", "cons": "licence cost"},
    {"key": "build", "summary": "Build it in Fabric", "cons": "6 extra weeks"},
]


async def test_decision_records_the_answer_and_who_gave_it(client):
    project = await setup_project(client)
    decision = (await client.post(f"{base(project)}/decisions/", json={
        "question": "Do we buy Profisee or build MDM in Fabric?",
        "options": OPTIONS, "recommended_option": "profisee",
        "impact_of_delay": "Blocks the golden-record work from 1 Aug",
        "due_date": str(date.today() + timedelta(days=5)),
    })).json()
    assert decision["status"] == "open" and decision["impact_of_delay"]

    resolved = (await client.post(f"{base(project)}/decisions/{decision['id']}/resolve/", json={
        "selected_option": "profisee", "note": "sponsor approved the licence",
    })).json()
    assert resolved["status"] == "resolved"
    assert resolved["selected_option"] == "profisee"
    assert resolved["decided_by_name"] == "Ada" and resolved["decided_at"]


async def test_a_decision_cannot_resolve_to_an_option_nobody_wrote_down(client):
    project = await setup_project(client)
    decision = (await client.post(f"{base(project)}/decisions/", json={
        "question": "Buy or build?", "options": OPTIONS,
    })).json()
    res = await client.post(f"{base(project)}/decisions/{decision['id']}/resolve/", json={
        "selected_option": "something-else",
    })
    assert res.status_code == 400
    assert res.json()["detail"]["error_code"] == "unknown_option"


async def test_resolved_decisions_leave_the_open_queue_and_overdue_leads(client):
    project = await setup_project(client)
    late = (await client.post(f"{base(project)}/decisions/", json={
        "question": "Late one", "due_date": str(date.today() - timedelta(days=3)),
    })).json()
    await client.post(f"{base(project)}/decisions/", json={
        "question": "Later one", "due_date": str(date.today() + timedelta(days=30)),
    })
    open_now = (await client.get(f"{base(project)}/decisions/")).json()
    assert open_now["total"] == 2 and open_now["overdue"] == 1
    assert open_now["items"][0]["question"] == "Late one"

    await client.post(f"{base(project)}/decisions/{late['id']}/resolve/", json={
        "selected_option": "yes",  # no options recorded → any answer is allowed
    })
    assert (await client.get(f"{base(project)}/decisions/")).json()["total"] == 1


# ── escalations ───────────────────────────────────────────────────────────────

async def test_escalation_lifecycle_measures_the_wait(client):
    project = await setup_project(client)
    escalation = (await client.post(f"{base(project)}/escalations/", json={
        "title": "Need production tenant access for the data engineer",
        "category": "access", "raised_to": "Client IT director",
        "needed_by": str(date.today() + timedelta(days=2)),
    })).json()
    assert escalation["status"] == "open" and escalation["raised_by_name"] == "Ada"
    assert escalation["acknowledged_at"] is None and escalation["age_days"] == 0

    acked = (await client.patch(
        f"{base(project)}/escalations/{escalation['id']}/", json={"status": "acknowledged"}
    )).json()
    assert acked["acknowledged_at"] is not None

    listing = (await client.get(f"{base(project)}/escalations/")).json()
    assert listing["total"] == 1 and listing["unacknowledged"] == 0

    resolved = (await client.post(
        f"{base(project)}/escalations/{escalation['id']}/resolve/",
        json={"resolution": "access granted 23 Jul"},
    )).json()
    assert resolved["status"] == "resolved" and resolved["resolution"]
    assert (await client.get(f"{base(project)}/escalations/")).json()["total"] == 0

    again = await client.post(f"{base(project)}/escalations/{escalation['id']}/resolve/", json={})
    assert again.status_code == 409


async def test_escalation_can_point_at_the_blocker_it_exists_to_clear(client):
    project = await setup_project(client)
    story = (await client.post(
        f"{base(project)}/stories/", json={"title": "Load the warehouse"}
    )).json()
    blocker = (await client.post(f"{base(project)}/stories/{story['id']}/blockers/", json={
        "reason": "no tenant access", "external_dependency": "client IT",
    })).json()
    escalation = (await client.post(f"{base(project)}/escalations/", json={
        "title": "Tenant access", "category": "access", "blocker_id": blocker["id"],
    })).json()
    assert escalation["blocker_id"] == blocker["id"]


async def test_viewer_cannot_write_governance_records(client):
    from tests.test_project_viewer_readonly import _sign_in, setup_project_with_alan

    project = await setup_project_with_alan(client, "viewer")
    await _sign_in(client, "alan@example.test")
    assert (await client.post(f"{base(project)}/risks/", json={"title": "x"})).status_code == 403
    assert (await client.post(
        f"{base(project)}/decisions/", json={"question": "x?"}
    )).status_code == 403
    assert (await client.post(
        f"{base(project)}/escalations/", json={"title": "x", "category": "access"}
    )).status_code == 403
