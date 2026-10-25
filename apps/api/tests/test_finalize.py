import gigsnano_api.bmad.finalize as finalize_module
from gigsnano_api.bmad.provider import FakeProvider
from tests.helpers import by_workflow, sprint_zero

CREATE_PROJECT = {
    "name": "Mobile App", "identifier": "MBA", "flow": "fresh", "has_ui": False,
    "cover_image_url": "https://img.test/c.jpg",
}
DOC = {"title": "PRD", "markdown": "# PRD\nFR-1 ..."}


async def setup(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    return (
        await client.post("/api/workspaces/acme/projects/", json=CREATE_PROJECT)
    ).json()


async def complete_direct(client, project_id, story_id):
    await client.patch(
        f"/api/workspaces/acme/projects/{project_id}/stories/{story_id}/",
        json={"status": "done"},
    )


async def run_workflow(client, project_id, story):
    base = f"/api/workspaces/acme/projects/{project_id}/stories/{story['id']}"
    await client.post(f"{base}/thread/")
    return await client.post(f"{base}/thread/finalize/")


async def test_finalize_creates_artifact_completes_story_unlocks(app, client):
    app.state.llm_provider = FakeProvider(extractions=[DOC])
    project = await setup(client)
    stories = await sprint_zero(client, project["id"])
    await complete_direct(client, project["id"], by_workflow(stories, "track-selection")["id"])
    prd = by_workflow(await sprint_zero(client, project["id"]), "bmad-prd")

    res = await run_workflow(client, project["id"], prd)
    assert res.status_code == 200
    assert res.json()["story"]["status"] == "done"
    assert res.json()["artifact_id"]

    stories = await sprint_zero(client, project["id"])
    assert by_workflow(stories, "bmad-create-architecture")["bmad"]["is_locked"] is False


async def test_extraction_retry_then_success(app, client):
    # First extraction is schema-invalid (missing markdown) → retried → succeeds.
    app.state.llm_provider = FakeProvider(extractions=[{"title": "PRD"}, DOC])
    project = await setup(client)
    stories = await sprint_zero(client, project["id"])
    await complete_direct(client, project["id"], by_workflow(stories, "track-selection")["id"])
    prd = by_workflow(await sprint_zero(client, project["id"]), "bmad-prd")
    res = await run_workflow(client, project["id"], prd)
    assert res.status_code == 200


async def test_extraction_exhausted_fails_session_then_retryable(app, client):
    bad = {"title": "PRD"}  # always schema-invalid
    app.state.llm_provider = FakeProvider(extractions=[bad, bad, bad, DOC])
    project = await setup(client)
    stories = await sprint_zero(client, project["id"])
    await complete_direct(client, project["id"], by_workflow(stories, "track-selection")["id"])
    prd = by_workflow(await sprint_zero(client, project["id"]), "bmad-prd")
    base = f"/api/workspaces/acme/projects/{project['id']}/stories/{prd['id']}"
    await client.post(f"{base}/thread/")

    res = await client.post(f"{base}/thread/finalize/")
    assert res.status_code == 502
    assert (await client.get(f"{base}/thread/")).json()["state"] == "failed"

    res = await client.post(f"{base}/thread/finalize/")  # retry from failed
    assert res.status_code == 200


async def test_post_extraction_failure_fails_session_then_retryable(app, client, monkeypatch):
    """C1 regression: a failure AFTER a successful extraction (e.g. apply_story_locks
    raising while applying side effects) must not strand the session in FINALIZING.
    Everything after the FINALIZING commit is now guarded, so it should roll back to
    FAILED (502, retryable) instead of leaking a 500 with the row stuck in FINALIZING
    forever (which the state guard treats as a hard, non-retryable conflict)."""
    calls = {"n": 0}
    original_apply_story_locks = finalize_module.apply_story_locks

    def flaky_apply_story_locks(*args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("boom: simulated post-extraction failure")
        return original_apply_story_locks(*args, **kwargs)

    monkeypatch.setattr(finalize_module, "apply_story_locks", flaky_apply_story_locks)

    # Two extractions scripted: the first finalize attempt fails post-extraction (after
    # consuming one), the retry needs a fresh one.
    app.state.llm_provider = FakeProvider(extractions=[DOC, DOC])
    project = await setup(client)
    stories = await sprint_zero(client, project["id"])
    await complete_direct(client, project["id"], by_workflow(stories, "track-selection")["id"])
    prd = by_workflow(await sprint_zero(client, project["id"]), "bmad-prd")
    base = f"/api/workspaces/acme/projects/{project['id']}/stories/{prd['id']}"
    await client.post(f"{base}/thread/")

    res = await client.post(f"{base}/thread/finalize/")
    assert res.status_code == 502
    assert (await client.get(f"{base}/thread/")).json()["state"] == "failed"

    # Patch removed for the retry (calls["n"] == 2 now takes the real code path).
    res = await client.post(f"{base}/thread/finalize/")
    assert res.status_code == 200
    assert (await client.get(f"{base}/thread/")).json()["state"] == "completed"


async def test_double_finalize_after_complete_returns_409(app, client):
    """I1 regression: a finalize on an already-COMPLETED session is rejected with 409
    (idempotency guard), never re-runs side effects. True concurrent double-submission
    can't be forced on sqlite's single connection, but this covers the guard logic that
    run_finalize now re-checks under `with_for_update()` in addition to the route's
    fast unlocked check — on Postgres a truly concurrent second request blocks on the
    row lock until the first commits, then observes COMPLETED via this same check."""
    app.state.llm_provider = FakeProvider(extractions=[DOC])
    project = await setup(client)
    stories = await sprint_zero(client, project["id"])
    await complete_direct(client, project["id"], by_workflow(stories, "track-selection")["id"])
    prd = by_workflow(await sprint_zero(client, project["id"]), "bmad-prd")

    res = await run_workflow(client, project["id"], prd)
    assert res.status_code == 200

    base = f"/api/workspaces/acme/projects/{project['id']}/stories/{prd['id']}"
    res = await client.post(f"{base}/thread/finalize/")
    assert res.status_code == 409


async def test_epics_finalize_creates_board_rows(app, client):
    epics_payload = {
        "title": "Epics & Stories", "markdown": "# Epics",
        "epics": [
            {"title": "Onboarding", "description": "", "stories": [
                {"title": "Sign-up flow", "description": "AC: ...", "priority": "high"},
                {"title": "MFA", "description": "", "priority": "medium"},
            ]},
        ],
    }
    app.state.llm_provider = FakeProvider(
        extractions=[DOC, {"title": "Arch", "markdown": "# Arch"}, epics_payload]
    )
    project = await setup(client)
    stories = await sprint_zero(client, project["id"])
    await complete_direct(client, project["id"], by_workflow(stories, "track-selection")["id"])
    for workflow in ("bmad-prd", "bmad-create-architecture", "bmad-create-epics-and-stories"):
        story = by_workflow(await sprint_zero(client, project["id"]), workflow)
        res = await run_workflow(client, project["id"], story)
        assert res.status_code == 200

    all_stories = (
        await client.get(f"/api/workspaces/acme/projects/{project['id']}/stories/")
    ).json()["items"]
    product = [s for s in all_stories if s["bmad"] is None]
    story_titles = {s["title"] for s in product if s["type"] == "story"}
    assert story_titles == {"Sign-up flow", "MFA"}
    epic = next(s for s in product if s["type"] == "epic")
    assert epic["title"] == "Onboarding"
    assert epic["sub_issue_count"] == 2
    assert next(s for s in product if s["title"] == "Sign-up flow")["priority"] == "high"


async def test_epics_finalize_creates_task_tree(app, client):
    epics_payload = {
        "title": "Epics & Stories",
        "markdown": "# Epics",
        "epics": [
            {
                "title": "Auth",
                "description": "",
                "stories": [
                    {
                        "title": "Login",
                        "description": "",
                        "priority": "high",
                        "tasks": [
                            {"title": "Build form", "description": ""},
                            {"title": "Wire API", "description": ""},
                        ],
                    },
                ],
            },
        ],
    }
    app.state.llm_provider = FakeProvider(
        extractions=[DOC, {"title": "Arch", "markdown": "# Arch"}, epics_payload]
    )
    project = await setup(client)
    stories = await sprint_zero(client, project["id"])
    await complete_direct(client, project["id"], by_workflow(stories, "track-selection")["id"])
    for workflow in ("bmad-prd", "bmad-create-architecture", "bmad-create-epics-and-stories"):
        story = by_workflow(await sprint_zero(client, project["id"]), workflow)
        res = await run_workflow(client, project["id"], story)
        assert res.status_code == 200

    all_stories = (
        await client.get(f"/api/workspaces/acme/projects/{project['id']}/stories/")
    ).json()["items"]
    product = [s for s in all_stories if s["bmad"] is None]
    epics = [s for s in product if s["type"] == "epic"]
    stories = [s for s in product if s["type"] == "story"]
    tasks = [s for s in product if s["type"] == "task"]
    assert len(epics) == 1
    assert len(stories) == 1
    assert len(tasks) == 2
    story = stories[0]
    assert story["parent_id"] == epics[0]["id"]
    assert story["sub_issue_count"] == 2
    assert all(t["parent_id"] == story["id"] for t in tasks)


async def test_readiness_verdict_recorded(app, client):
    verdict = {"verdict": "pass", "concerns": [], "markdown": "# Report"}
    epics_payload = {"title": "E", "markdown": "# E", "epics": [
        {"title": "Core", "description": "", "stories": [
            {"title": "S1", "description": "", "priority": "none"}]}]}
    app.state.llm_provider = FakeProvider(
        extractions=[DOC, {"title": "Arch", "markdown": "# Arch"}, epics_payload, verdict]
    )
    project = await setup(client)
    stories = await sprint_zero(client, project["id"])
    await complete_direct(client, project["id"], by_workflow(stories, "track-selection")["id"])
    for workflow in ("bmad-prd", "bmad-create-architecture",
                     "bmad-create-epics-and-stories",
                     "bmad-check-implementation-readiness"):
        story = by_workflow(await sprint_zero(client, project["id"]), workflow)
        await run_workflow(client, project["id"], story)

    stories = await sprint_zero(client, project["id"])
    gate = by_workflow(stories, "bmad-check-implementation-readiness")
    assert gate["bmad"]["readiness_result"] == "pass"
    assert by_workflow(stories, "bmad-sprint-planning")["bmad"]["is_locked"] is False


async def test_sprint_plan_creates_cycles_and_assigns(app, client):
    verdict = {"verdict": "pass", "concerns": [], "markdown": "# Report"}
    epics_payload = {"title": "E", "markdown": "# E", "epics": [
        {"title": "Core", "description": "", "stories": [
            {"title": "S1", "description": "", "priority": "none"},
            {"title": "S2", "description": "", "priority": "none"}]}]}
    app.state.llm_provider = FakeProvider(
        extractions=[DOC, {"title": "Arch", "markdown": "# Arch"}, epics_payload, verdict]
    )
    project = await setup(client)
    stories = await sprint_zero(client, project["id"])
    await complete_direct(client, project["id"], by_workflow(stories, "track-selection")["id"])
    for workflow in ("bmad-prd", "bmad-create-architecture",
                     "bmad-create-epics-and-stories",
                     "bmad-check-implementation-readiness"):
        story = by_workflow(await sprint_zero(client, project["id"]), workflow)
        await run_workflow(client, project["id"], story)

    # Grab the product stories epics created, then script the sprint-plan extraction
    # with their real ids (the provider can be swapped mid-test).
    all_stories = (
        await client.get(f"/api/workspaces/acme/projects/{project['id']}/stories/")
    ).json()["items"]
    product_ids = [
        s["id"] for s in all_stories if s["bmad"] is None and s["type"] == "story"
    ]
    assert len(product_ids) == 2
    app.state.llm_provider = FakeProvider(extractions=[{
        "title": "Sprint Plan", "markdown": "# Plan",
        "sprints": [{"name": "Sprint 1", "story_ids": product_ids}],
    }])
    planning = by_workflow(await sprint_zero(client, project["id"]), "bmad-sprint-planning")
    res = await run_workflow(client, project["id"], planning)
    assert res.status_code == 200

    cycles = (
        await client.get(f"/api/workspaces/acme/projects/{project['id']}/cycles/")
    ).json()
    sprint1 = next(c for c in cycles if c["name"] == "Sprint 1")
    assert sprint1["is_sprint_zero"] is False
    assert sprint1["story_count"] == 2

    # Only the *required* path was run; the 3 optional analysis steps
    # (brainstorming/research/product-brief) remain todo and still count toward the
    # Sprint-0 rollup (frontend bmad-unlock.ts `rollupSprintZeroProgress` counts every
    # non-skipped-UX story). So 6/9 done ⇒ "in_progress", not "complete". This matches
    # the engine ported in Plan 2 (test_unlock.py::test_rollup_and_status).
    project_now = (await client.get(f"/api/workspaces/acme/projects/{project['id']}/")).json()
    assert project_now["sprint_zero_status"] == "in_progress"


async def test_finalize_emits_agent_notification(app, client, db_session):
    """GIN-293: finalizing a workflow (a completed agent run) notifies the story's
    watchers with an AGENT-kind notification via the agent.run_completed template."""
    from gigsnano_api.models import ENotificationKind, NotificationTemplate

    app.state.llm_provider = FakeProvider(extractions=[DOC])
    project = await setup(client)  # Ada is owner + finalize actor

    # Bob: a second project member, assigned the PRD story (a watcher != actor).
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Bob", "email": "bob-agent@example.test", "password": "s3cret!"})
    bob = (await client.get("/api/auth/me/")).json()
    await client.post("/api/auth/sign-in/", json={"email": "ada@example.test", "password": "s3cret!"})
    await client.post("/api/workspaces/acme/members/", json={"user_id": bob["id"], "role": "member"})
    await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/members/",
        json={"user_id": bob["id"], "role": "member"},
    )

    # Templates are seeded by migration in prod; seed the one under test here.
    db_session.add(NotificationTemplate(
        trigger_key="agent.run_completed", kind=ENotificationKind.AGENT,
        label="Agent run completed", description="",
        title_template="{agent} finished {workflow}",
        body_template="{agent} completed {workflow} on {story}",
        default_title_template="{agent} finished {workflow}",
        default_body_template="{agent} completed {workflow} on {story}",
        variables=["agent", "workflow", "story"], enabled=True,
    ))
    await db_session.commit()

    stories = await sprint_zero(client, project["id"])
    await complete_direct(client, project["id"], by_workflow(stories, "track-selection")["id"])
    prd = by_workflow(await sprint_zero(client, project["id"]), "bmad-prd")
    await client.patch(
        f"/api/workspaces/acme/projects/{project['id']}/stories/{prd['id']}/",
        json={"assignee_id": bob["id"]},
    )

    assert (await run_workflow(client, project["id"], prd)).status_code == 200

    # Bob (assignee/watcher) gets the AGENT notification; it lands in Agent & system.
    await client.post("/api/auth/sign-in/", json={"email": "bob-agent@example.test", "password": "s3cret!"})
    items = (
        await client.get("/api/workspaces/acme/notifications/?category=agent_system")
    ).json()["items"]
    agent_notes = [n for n in items if n["kind"] == "agent"]
    assert len(agent_notes) == 1
    assert "prd" in agent_notes[0]["body"].lower()
