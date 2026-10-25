"""GIN-385: a recovery plan is a change set — proposed, partly approved, applied,
and undoable. The tests that matter are the ones proving it does *not* change the
project until told to, and that rollback restores what was actually replaced."""


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


async def fetch(client, code):
    return (await client.get(f"/api/workspaces/acme/stories/resolve/{code}")).json()


async def test_creating_a_plan_changes_nothing(client):
    project = await setup_project(client)
    story = await make_story(client, project, "Ship the warehouse", priority="low")
    plan = (await client.post(f"{base(project)}/recovery-plans/", json={
        "title": "Recovery: re-prioritize the critical path",
        "changes": [{
            "code": story["code"], "field": "priority", "proposed_value": "urgent",
            "reason": "It blocks four other items", "confidence": 0.9,
        }],
    })).json()
    assert plan["status"] == "draft" and plan["counts"]["proposed"] == 1
    assert plan["changes"][0]["current_value"] == "low"
    assert (await fetch(client, story["code"]))["priority"] == "low"  # untouched


async def test_partial_approval_applies_only_what_was_approved(client):
    project = await setup_project(client)
    one = await make_story(client, project, "Item one", priority="low")
    two = await make_story(client, project, "Item two", priority="low")
    plan = (await client.post(f"{base(project)}/recovery-plans/", json={
        "title": "Two changes", "changes": [
            {"code": one["code"], "field": "priority", "proposed_value": "urgent",
             "reason": "critical path"},
            {"code": two["code"], "field": "priority", "proposed_value": "high",
             "reason": "nice to have"},
        ],
    })).json()
    first = plan["changes"][0]["id"]

    await client.post(f"{base(project)}/recovery-plans/{plan['id']}/approve/",
                      json={"change_ids": [first]})
    applied = (await client.post(
        f"{base(project)}/recovery-plans/{plan['id']}/apply/", json={}
    )).json()
    assert applied["counts"]["applied"] == 1 and applied["counts"]["proposed"] == 1

    assert (await fetch(client, one["code"]))["priority"] == "urgent"
    assert (await fetch(client, two["code"]))["priority"] == "low"  # never approved


async def test_apply_needs_an_approval_first(client):
    project = await setup_project(client)
    story = await make_story(client, project, "Item", priority="low")
    plan = (await client.post(f"{base(project)}/recovery-plans/", json={
        "title": "Unapproved", "changes": [
            {"code": story["code"], "field": "priority", "proposed_value": "high"},
        ],
    })).json()
    res = await client.post(f"{base(project)}/recovery-plans/{plan['id']}/apply/", json={})
    assert res.status_code == 409
    assert res.json()["detail"]["error_code"] == "nothing_approved"


async def test_rollback_restores_the_value_that_was_actually_replaced(client):
    project = await setup_project(client)
    story = await make_story(client, project, "Item", priority="low")
    plan = (await client.post(f"{base(project)}/recovery-plans/", json={
        "title": "Bump", "changes": [
            {"code": story["code"], "field": "priority", "proposed_value": "urgent"},
        ],
    })).json()
    await client.post(f"{base(project)}/recovery-plans/{plan['id']}/approve/", json={})

    # The row moves after the plan was proposed: rollback must restore *this*
    # value, not the one the plan recorded at proposal time.
    await client.patch(
        f"{base(project)}/stories/{story['id']}/", json={"priority": "medium"}
    )
    applied = (await client.post(
        f"{base(project)}/recovery-plans/{plan['id']}/apply/", json={}
    )).json()
    assert applied["changes"][0]["previous_value"] == "medium"
    assert (await fetch(client, story["code"]))["priority"] == "urgent"

    rolled = (await client.post(
        f"{base(project)}/recovery-plans/{plan['id']}/rollback/", json={}
    )).json()
    assert rolled["status"] == "rolled_back"
    assert (await fetch(client, story["code"]))["priority"] == "medium"


async def test_only_an_applied_plan_can_be_rolled_back(client):
    project = await setup_project(client)
    story = await make_story(client, project, "Item")
    plan = (await client.post(f"{base(project)}/recovery-plans/", json={
        "title": "Draft", "changes": [
            {"code": story["code"], "field": "priority", "proposed_value": "high"},
        ],
    })).json()
    res = await client.post(f"{base(project)}/recovery-plans/{plan['id']}/rollback/", json={})
    assert res.status_code == 409
    assert res.json()["detail"]["error_code"] == "plan_not_applied"


async def test_a_paused_director_cannot_apply_a_plan(client):
    """GIN-387 + GIN-385: the stop button has to actually stop the thing that
    changes the project."""
    project = await setup_project(client)
    story = await make_story(client, project, "Item", priority="low")
    plan = (await client.post(f"{base(project)}/recovery-plans/", json={
        "title": "Blocked by pause", "changes": [
            {"code": story["code"], "field": "priority", "proposed_value": "urgent"},
        ],
    })).json()
    await client.post(f"{base(project)}/recovery-plans/{plan['id']}/approve/", json={})
    await client.post(f"{base(project)}/autonomy-policy/pause/", json={"reason": "incident"})

    res = await client.post(f"{base(project)}/recovery-plans/{plan['id']}/apply/", json={})
    assert res.status_code == 409
    assert res.json()["detail"]["error_code"] == "director_paused"
    assert (await fetch(client, story["code"]))["priority"] == "low"

    await client.post(f"{base(project)}/autonomy-policy/resume/")
    assert (await client.post(
        f"{base(project)}/recovery-plans/{plan['id']}/apply/", json={}
    )).status_code == 200


async def test_plan_rejects_fields_it_may_not_touch_and_unknown_codes(client):
    project = await setup_project(client)
    story = await make_story(client, project, "Item")
    bad_field = await client.post(f"{base(project)}/recovery-plans/", json={
        "title": "Sneaky", "changes": [
            {"code": story["code"], "field": "description", "proposed_value": "rewritten"},
        ],
    })
    assert bad_field.status_code == 400
    assert bad_field.json()["detail"]["error_code"] == "unsupported_field"

    bad_code = await client.post(f"{base(project)}/recovery-plans/", json={
        "title": "Ghost", "changes": [
            {"code": "MBA-9999", "field": "priority", "proposed_value": "high"},
        ],
    })
    assert bad_code.status_code == 400
    assert bad_code.json()["detail"]["error_code"] == "unresolvable_codes"

    empty = await client.post(f"{base(project)}/recovery-plans/", json={"title": "Nothing"})
    assert empty.status_code == 400
    assert empty.json()["detail"]["error_code"] == "empty_plan"


async def test_a_plan_seeded_from_the_audit_only_carries_safe_repairs(client):
    """The audit finds thin descriptions and missing acceptance criteria too — those
    are judgement calls and must never become auto-proposed changes. The one repair
    a machine may propose is a fact about two records: an item cannot be in progress
    while something blocks it."""
    project = await setup_project(client)
    story = await make_story(client, project, "Load the warehouse")
    await client.post(f"{base(project)}/stories/{story['id']}/blockers/", json={
        "reason": "no tenant access", "external_dependency": "client IT",
    })
    await client.patch(
        f"{base(project)}/stories/{story['id']}/", json={"status": "in_progress"}
    )

    plan = (await client.post(f"{base(project)}/recovery-plans/", json={
        "title": "From the audit", "from_readiness_audit": True,
    })).json()
    assert plan["counts"]["total"] >= 1
    assert {c["field"] for c in plan["changes"]} <= {"status", "priority", "start_date"}
    assert all(c["evidence"] == "readiness audit" for c in plan["changes"])
    move_back = next(c for c in plan["changes"] if c["field"] == "status")
    assert move_back["current_value"] == "in_progress"
    assert move_back["proposed_value"] == "todo"
    # Nothing about the description or acceptance criteria is ever proposed.
    assert not any(c["field"] == "description" for c in plan["changes"])


async def test_a_backlog_with_nothing_machine_fixable_yields_an_empty_plan(client):
    """Honest failure: seeding a plan from a backlog whose only problems need human
    judgement produces nothing, and says so."""
    project = await setup_project(client)
    await client.post(f"{base(project)}/stories/", json={"title": "tbd"})
    res = await client.post(f"{base(project)}/recovery-plans/", json={
        "title": "From the audit", "from_readiness_audit": True,
    })
    assert res.status_code == 400
    assert res.json()["detail"]["error_code"] == "empty_plan"
