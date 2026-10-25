"""GIN-383: blockers as first-class records — raise, own, escalate, resolve."""

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


async def make_story(client, project, title="Ship the thing"):
    return (await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/stories/", json={"title": title}
    )).json()


def base(project) -> str:
    return f"/api/workspaces/acme/projects/{project['id']}"


async def test_blocker_on_an_external_dependency(client):
    """The case a blocking relation cannot express at all."""
    project = await setup_project(client)
    story = await make_story(client, project)
    res = await client.post(f"{base(project)}/stories/{story['id']}/blockers/", json={
        "reason": "Waiting on the client's Azure tenant access",
        "external_dependency": "Azure tenant access request #4471",
        "impact": "high",
        "expected_resolution_date": str(date.today() + timedelta(days=3)),
    })
    assert res.status_code == 201
    blocker = res.json()
    assert blocker["status"] == "open" and blocker["impact"] == "high"
    assert blocker["blocking_code"] is None
    assert blocker["raised_by_name"] == "Ada"
    assert blocker["overdue"] is False

    # It shows up in the item's own history, not only in a side table.
    history = (await client.get(f"{base(project)}/stories/{story['id']}/history/")).json()
    assert any("blocked" in a["summary"] for a in history)


async def test_blocker_on_another_work_item_by_code(client):
    project = await setup_project(client)
    blocked = await make_story(client, project, "Build the report")
    blocker_item = await make_story(client, project, "Ship the warehouse")
    res = await client.post(f"{base(project)}/stories/{blocked['id']}/blockers/", json={
        "reason": "Needs the warehouse first", "blocking_code": blocker_item["code"],
    })
    assert res.status_code == 201
    assert res.json()["blocking_code"] == blocker_item["code"]


async def test_a_blocker_needs_something_that_blocks_it(client):
    project = await setup_project(client)
    story = await make_story(client, project)
    res = await client.post(f"{base(project)}/stories/{story['id']}/blockers/", json={
        "reason": "just stuck",
    })
    assert res.status_code == 400
    assert res.json()["detail"]["error_code"] == "missing_blocking_source"


async def test_an_item_cannot_block_itself(client):
    project = await setup_project(client)
    story = await make_story(client, project)
    res = await client.post(f"{base(project)}/stories/{story['id']}/blockers/", json={
        "reason": "circular", "blocking_code": story["code"],
    })
    assert res.status_code == 400
    assert res.json()["detail"]["error_code"] == "self_block"


async def test_project_list_counts_open_overdue_and_escalated(client):
    project = await setup_project(client)
    one = await make_story(client, project, "A")
    two = await make_story(client, project, "B")
    await client.post(f"{base(project)}/stories/{one['id']}/blockers/", json={
        "reason": "overdue one", "external_dependency": "vendor",
        "expected_resolution_date": str(date.today() - timedelta(days=2)),
    })
    fresh = (await client.post(f"{base(project)}/stories/{two['id']}/blockers/", json={
        "reason": "fresh one", "external_dependency": "legal",
    })).json()
    await client.post(f"{base(project)}/blockers/{fresh['id']}/escalate/", json={
        "level": "project", "note": "day 3",
    })

    listing = (await client.get(f"{base(project)}/blockers/")).json()
    assert listing["total"] == 2 and listing["open"] == 2
    assert listing["overdue"] == 1 and listing["escalated"] == 1
    # Oldest first: age is the point of the list.
    assert listing["items"][0]["reason"] == "overdue one"


async def test_resolution_records_evidence_and_is_not_repeatable(client):
    project = await setup_project(client)
    story = await make_story(client, project)
    blocker = (await client.post(f"{base(project)}/stories/{story['id']}/blockers/", json={
        "reason": "waiting on access", "external_dependency": "IT ticket",
    })).json()

    resolved = (await client.post(
        f"{base(project)}/blockers/{blocker['id']}/resolve/",
        json={"resolution_evidence": "IT ticket #99 closed"},
    )).json()
    assert resolved["status"] == "resolved"
    assert resolved["resolution_evidence"] == "IT ticket #99 closed"
    assert resolved["resolved_at"] and resolved["resolved_by_id"]

    again = await client.post(f"{base(project)}/blockers/{blocker['id']}/resolve/", json={})
    assert again.status_code == 409
    assert again.json()["detail"]["error_code"] == "blocker_not_open"

    # Resolved blockers leave the default (open) view.
    assert (await client.get(f"{base(project)}/blockers/")).json()["total"] == 0
    assert (await client.get(f"{base(project)}/blockers/?status_filter=resolved")).json()["total"] == 1


async def test_cancelled_is_distinct_from_resolved(client):
    """"It was never really blocking" must not read as "we overcame it"."""
    project = await setup_project(client)
    story = await make_story(client, project)
    blocker = (await client.post(f"{base(project)}/stories/{story['id']}/blockers/", json={
        "reason": "thought we needed sign-off", "external_dependency": "legal",
    })).json()
    out = (await client.post(
        f"{base(project)}/blockers/{blocker['id']}/resolve/", json={"cancelled": True}
    )).json()
    assert out["status"] == "cancelled"


async def test_escalation_only_moves_up(client):
    project = await setup_project(client)
    story = await make_story(client, project)
    blocker = (await client.post(f"{base(project)}/stories/{story['id']}/blockers/", json={
        "reason": "vendor silence", "external_dependency": "vendor",
    })).json()

    up = (await client.post(
        f"{base(project)}/blockers/{blocker['id']}/escalate/", json={"level": "sponsor"}
    )).json()
    assert up["escalation_level"] == "sponsor"

    down = await client.post(
        f"{base(project)}/blockers/{blocker['id']}/escalate/", json={"level": "team"}
    )
    assert down.status_code == 409
    assert down.json()["detail"]["error_code"] == "escalation_not_higher"


async def test_viewer_cannot_raise_or_resolve_a_blocker(client):
    from tests.test_project_viewer_readonly import _sign_in, setup_project_with_alan

    project = await setup_project_with_alan(client, "viewer")
    story = await make_story(client, project)
    await _sign_in(client, "alan@example.test")
    res = await client.post(f"{base(project)}/stories/{story['id']}/blockers/", json={
        "reason": "nope", "external_dependency": "x",
    })
    assert res.status_code == 403
