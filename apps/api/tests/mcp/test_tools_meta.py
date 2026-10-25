import pytest

from gigsnano_api.mcp_server import tools
from gigsnano_api.mcp_server.auth import set_bearer


from tests.mcp.payload import dumps

@pytest.mark.asyncio
async def test_list_projects(pat_for_user):
    set_bearer(pat_for_user.token)
    output = await tools.list_projects()
    assert pat_for_user.workspace_slug in dumps(output) or "[]" in output


@pytest.mark.asyncio
async def test_whoami_names_the_token_owner_whatever_the_active_workspace(
    pat_for_user, monkeypatch
):
    """Identity must not hang on a workspace: a caller with several workspaces and
    none (or the wrong one) selected still learns who they are."""
    set_bearer(pat_for_user.token)

    async def _boom():
        raise AssertionError("whoami consulted default_workspace()")

    monkeypatch.setattr("gigsnano_api.mcp_server.tools.work_items.default_workspace", _boom)
    output = await tools.whoami()
    assert output["id"] == pat_for_user.user_id
    assert output["email"]
    assert output["display_name"]
    assert set(output) == {"id", "display_name", "email"}


@pytest.mark.asyncio
async def test_list_projects_scopes_without_the_active_workspace(pat_for_user, monkeypatch):
    """An explicit slug must bypass default_workspace() entirely — that is the whole
    point: a client that can't call set_active_workspace still gets the right rows."""
    set_bearer(pat_for_user.token)

    async def _boom():
        raise AssertionError("default_workspace() consulted despite an explicit slug")

    monkeypatch.setattr("gigsnano_api.mcp_server.tools.projects.default_workspace", _boom)
    output = await tools.list_projects(workspace=pat_for_user.workspace_slug)
    assert pat_for_user.workspace_slug in dumps(output) or "[]" in dumps(output)


@pytest.mark.asyncio
async def test_module_management_round_trip(pat_for_user, seed_project, seed_story):
    """GIN-380: create a module and populate it without leaving MCP."""
    set_bearer(pat_for_user.token)
    project = f"{pat_for_user.workspace_slug}/{seed_project.id}"
    module = await tools.create_module(project=project, name="Payments")
    assert module["id"]

    assigned = await tools.bulk_assign_work_items_to_module(
        project=project, module_id=module["id"], codes=[seed_story.code]
    )
    assert assigned["counts"]["updated"] == 1
    items = await tools.list_module_work_items(project=project, module_id=module["id"])
    assert seed_story.code in dumps(items)

    await tools.bulk_remove_work_items_from_module(project=project, codes=[seed_story.code])
    assert await tools.list_module_work_items(project=project, module_id=module["id"]) == []

    await tools.update_module(project=project, module_id=module["id"], status="in_progress")
    assert (await tools.get_module(project=project, module_id=module["id"]))["status"] == (
        "in_progress"
    )
    assert (await tools.delete_module(project=project, module_id=module["id"]))["success"]


@pytest.mark.asyncio
async def test_project_control_plane_tools(pat_for_user, seed_project, seed_story):
    """GIN-382: plan the project, move work in bulk, relate items — all from MCP."""
    set_bearer(pat_for_user.token)
    project = f"{pat_for_user.workspace_slug}/{seed_project.id}"

    cycle = await tools.create_cycle(project=project, name="Recovery sprint")
    milestone = await tools.create_milestone(project=project, name="Beta", target_date="2026-09-30")
    release = await tools.create_release(project=project, version="1.0.0")

    structure = await tools.list_project_structure(project=project)
    assert cycle["id"] in [c["id"] for c in structure["cycles"]]  # plus the seeded Sprint-0
    assert [m["name"] for m in structure["milestones"]] == ["Beta"]
    assert [r["version"] for r in structure["releases"]] == ["1.0.0"]

    moved = await tools.bulk_assign_work_items_to_cycle(
        project=project, cycle_id=cycle["id"], codes=[seed_story.code]
    )
    assert moved["counts"]["updated"] == 1
    assert seed_story.code in dumps(
        await tools.list_cycle_work_items(project=project, cycle_id=cycle["id"])
    )

    preview = await tools.bulk_change_work_item_status(
        project=project, status="in_progress", codes=[seed_story.code], dry_run=True
    )
    assert preview["dry_run"] and preview["updated"][0]["previous"] == {"status": "todo"}

    other = await tools.create_work_item(project=project, title="Blocker")
    relation = await tools.create_work_item_relation(
        code=other["code"], related_code=seed_story.code, relation_type="blocking"
    )
    assert relation["relation_type"] == "blocking"
    assert dumps(await tools.list_work_item_relations(code=other["code"])).count("blocking") == 1
    await tools.delete_work_item_relation(code=other["code"], relation_id=relation["id"])

    assert "forecast" in await tools.get_project_forecast(project=project)
    assert "items" in await tools.list_project_activity(project=project, limit=5)
    await tools.link_work_items_to_milestone(
        project=project, milestone_id=milestone["id"], codes=[seed_story.code]
    )
    await tools.link_work_items_to_release(
        project=project, release_id=release["id"], codes=[seed_story.code]
    )
    assert (await tools.delete_cycle(project=project, cycle_id=cycle["id"]))["success"]


@pytest.mark.asyncio
async def test_readiness_tools_diagnose_the_backlog(pat_for_user, seed_project, seed_story):
    """GIN-384: grade the backlog and one item, without editing anything."""
    set_bearer(pat_for_user.token)
    project = f"{pat_for_user.workspace_slug}/{seed_project.id}"

    audit = await tools.audit_project_work_items(project=project)
    assert audit["work_items_total"] >= 1
    assert sum(audit["by_readiness"].values()) == audit["work_items_total"]
    assert audit["items"][0]["score"] <= 100

    one = await tools.get_work_item_readiness(code=seed_story.code)
    assert one["code"] == seed_story.code
    # "Test story" has no description: it must read as a draft with repairs to make.
    assert one["readiness"] in {"draft", "needs_clarification"}
    assert any(not p["auto_applicable"] for p in one["proposed_repairs"])

    dupes = await tools.detect_duplicate_work_items(project=project)
    assert "pairs" in dupes and isinstance(dupes["count"], int)


@pytest.mark.asyncio
async def test_autonomy_policy_gates_director_actions(pat_for_user, seed_project):
    """GIN-387: ask before acting, and the stop button actually stops."""
    set_bearer(pat_for_user.token)
    project = f"{pat_for_user.workspace_slug}/{seed_project.id}"

    policy = await tools.get_project_autonomy_policy(project=project)
    assert policy["paused"] is False and policy["limits"]["max_items_per_run"] == 25

    await tools.update_project_autonomy_policy(project=project, max_items_per_run=2)
    ok = await tools.request_project_director_action(
        project=project, action="assign_module", reason="grouping", item_count=1
    )
    assert ok["decision"]["allowed"] and ok["action"]["status"] == "auto_approved"

    over = await tools.request_project_director_action(
        project=project, action="assign_module", reason="sweep", item_count=50
    )
    assert over["decision"]["requires_approval"]
    queue = await tools.list_project_director_actions(project=project, status="pending")
    assert [i["id"] for i in queue["items"]] == [over["action"]["id"]]

    decided = await tools.approve_project_director_action(
        project=project, action_id=over["action"]["id"], note="reviewed"
    )
    assert decided["status"] == "approved" and decided["decided_by_name"]

    await tools.pause_project_director(project=project, reason="incident")
    blocked = await tools.request_project_director_action(
        project=project, action="assign_module", item_count=1
    )
    assert blocked["decision"]["allowed"] is False
    await tools.resume_project_director(project=project)


@pytest.mark.asyncio
async def test_blocker_tools_track_why_work_is_stopped(pat_for_user, seed_project, seed_story):
    """GIN-383: raise, escalate and clear a blocker from MCP."""
    set_bearer(pat_for_user.token)
    project = f"{pat_for_user.workspace_slug}/{seed_project.id}"

    blocker = await tools.mark_work_item_blocked(
        code=seed_story.code,
        reason="waiting on the client's tenant access",
        external_dependency="Azure tenant access request",
        impact="high",
    )
    assert blocker["status"] == "open" and blocker["blocking_code"] is None

    listing = await tools.list_project_blockers(project=project)
    assert listing["open"] == 1 and listing["items"][0]["id"] == blocker["id"]

    escalated = await tools.escalate_blocker(
        project=project, blocker_id=blocker["id"], level="sponsor", note="day 5"
    )
    assert escalated["escalation_level"] == "sponsor"

    # An open blocker makes the readiness audit report the item as blocked.
    assert (await tools.get_work_item_readiness(code=seed_story.code))["readiness"] == "blocked"

    cleared = await tools.resolve_blocker(
        project=project, blocker_id=blocker["id"], resolution_evidence="access granted"
    )
    assert cleared["status"] == "resolved"
    assert (await tools.list_project_blockers(project=project))["open"] == 0


@pytest.mark.asyncio
async def test_governance_records_from_mcp(pat_for_user, seed_project):
    """GIN-386: risks, decisions and escalations as queryable records."""
    set_bearer(pat_for_user.token)
    project = f"{pat_for_user.workspace_slug}/{seed_project.id}"

    risk = await tools.create_project_risk(
        project=project, title="Capacity may not land in time",
        category="external", probability=4, impact=5,
    )
    assert risk["exposure"] == 20
    register = await tools.list_project_risks(project=project)
    assert register["highest_exposure"] == 20 and register["open"] == 1
    assert (await tools.close_project_risk(
        project=project, risk_id=risk["id"], note="capacity assigned", occurred=False
    ))["status"] == "closed"

    decision = await tools.create_project_decision(
        project=project, question="Buy or build MDM?",
        options=[{"key": "buy", "summary": "Profisee"}, {"key": "build", "summary": "Fabric"}],
        recommended_option="buy", impact_of_delay="blocks golden records",
    )
    assert (await tools.list_open_project_decisions(project=project))["total"] == 1
    resolved = await tools.resolve_project_decision(
        project=project, decision_id=decision["id"], selected_option="buy", note="approved"
    )
    assert resolved["selected_option"] == "buy" and resolved["decided_by_name"]

    escalation = await tools.create_project_escalation(
        project=project, title="Tenant access", category="access",
        raised_to="Client IT director",
    )
    assert (await tools.list_open_project_escalations(project=project))["unacknowledged"] == 1
    cleared = await tools.resolve_project_escalation(
        project=project, escalation_id=escalation["id"], resolution="granted"
    )
    assert cleared["status"] == "resolved"


@pytest.mark.asyncio
async def test_recovery_plan_round_trip(pat_for_user, seed_project, seed_story):
    """GIN-385: propose, approve part, apply, roll back — all from MCP."""
    set_bearer(pat_for_user.token)
    project = f"{pat_for_user.workspace_slug}/{seed_project.id}"

    plan = await tools.create_project_recovery_plan(
        project=project, title="Recovery: reprioritize",
        changes=[{"code": seed_story.code, "field": "priority",
                  "proposed_value": "urgent", "reason": "on the critical path"}],
    )
    assert plan["status"] == "draft" and plan["counts"]["proposed"] == 1
    # Proposing changed nothing.
    assert (await tools.get_work_item(code=seed_story.code))["priority"] != "urgent"

    await tools.approve_project_recovery_plan(project=project, plan_id=plan["id"])
    applied = await tools.apply_project_recovery_plan(project=project, plan_id=plan["id"])
    assert applied["counts"]["applied"] == 1
    assert (await tools.get_work_item(code=seed_story.code))["priority"] == "urgent"

    rolled = await tools.rollback_project_recovery_plan(project=project, plan_id=plan["id"])
    assert rolled["status"] == "rolled_back"
    assert (await tools.get_work_item(code=seed_story.code))["priority"] != "urgent"


@pytest.mark.asyncio
async def test_control_run_and_change_feed(pat_for_user, seed_project, seed_story):
    """GIN-388: observe, propose, and resume from a cursor."""
    set_bearer(pat_for_user.token)
    project = f"{pat_for_user.workspace_slug}/{seed_project.id}"

    run = await tools.run_project_control_cycle(project=project)
    assert run["status"] == "completed" and run["correlation_id"]
    assert run["actions_executed"] == [] and run["model"] is None
    assert all(f["evidence"] for f in run["findings"]["items"])

    runs = await tools.list_project_control_runs(project=project)
    assert runs["items"][0]["id"] == run["id"]
    assert (await tools.get_project_control_run(
        project=project, run_id=run["id"]))["id"] == run["id"]

    feed = await tools.get_project_changes_since(project=project)
    cursor = feed["cursor"]
    assert (await tools.get_project_changes_since(
        project=project, since=cursor))["returned"] == 0

    assert "items" in await tools.list_stale_work_items(project=project)
    assert "owners" in await tools.generate_team_today_plan(project=project)


@pytest.mark.asyncio
async def test_create_label(pat_for_user, seed_project):
    set_bearer(pat_for_user.token)
    output = await tools.create_label(
        project=f"{pat_for_user.workspace_slug}/{seed_project.id}",
        name="bug",
        color="#f00",
    )
    assert "bug" in dumps(output)
