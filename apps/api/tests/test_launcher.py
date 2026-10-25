import pytest
from sqlalchemy import func, select

from gigsnano_api.features.execution_profiles import service as ep
from gigsnano_api.features.skill_events import service as se
from gigsnano_api.features.skills import service as registry
from gigsnano_api.features.skills.launcher import (
    LaunchBlocked,
    completion_gate,
    gate_status,
    prepare_launch,
)
from gigsnano_api.features.skills.seed import seed_skills
from gigsnano_api.models.agent_runs import AgentRun
from gigsnano_api.models.skill_events import ESkillEventState, SkillEvent
from gigsnano_api.models.stories import Story


async def _run_count(db, story_id: str) -> int:
    return (
        await db.execute(select(func.count()).select_from(AgentRun).where(AgentRun.story_id == story_id))
    ).scalar_one()


async def _story(db, project, title="Refactor the button component design"):
    s = Story(project_id=project.id, title=title)
    db.add(s)
    await db.flush()
    return s


async def _publish(db, name, version="1.0.0"):
    await registry.publish(
        db, workspace_id="system", name=name, version=version, visibility="public",
        files={"SKILL.md": f"---\nname: {name}\ndescription: {name}\n---\n"}, manifest={},
    )


async def test_prepare_launch_happy_path(db_session, make_project):
    p = await make_project()
    ws = p.workspace_id
    await seed_skills(db_session)
    story = await _story(db_session, p)
    await ep.resolve_and_persist(db_session, story, ws, story.title, "claude-code")

    plan = await prepare_launch(db_session, story, ws)
    assert plan.agent == "claude-code"
    assert "ui-ux-design" in plan.skill_prompt  # a pinned design skill's body is delivered
    assert "Active skills for this run" in plan.skill_prompt
    assert "verification-gate" in plan.required
    events = await se.list_events(db_session, plan.run_id)
    assert any(
        e.state == ESkillEventState.RESOLVED and e.skill_id == "verification-gate" for e in events
    )


async def test_no_profile_blocks(db_session, make_project):
    p = await make_project()
    story = await _story(db_session, p)
    with pytest.raises(LaunchBlocked, match="no execution profile"):
        await prepare_launch(db_session, story, p.workspace_id)
    assert await _run_count(db_session, story.id) == 0  # refused before any run created


async def test_stale_profile_blocks_and_creates_no_run(db_session, make_project):
    p = await make_project()
    ws = p.workspace_id
    await seed_skills(db_session)
    story = await _story(db_session, p)
    await ep.resolve_and_persist(db_session, story, ws, story.title, "claude-code")
    await _publish(db_session, "verification-gate", version="2.0.0")  # stored profile now stale
    with pytest.raises(LaunchBlocked, match="stale"):
        await prepare_launch(db_session, story, ws)
    assert await _run_count(db_session, story.id) == 0  # no run/events leaked past the guard
    assert (await db_session.execute(select(func.count()).select_from(SkillEvent))).scalar_one() == 0


async def test_missing_required_skill_blocks(db_session, make_project):
    p = await make_project()
    ws = p.workspace_id
    # publish only 2 of the 3 required core skills — verification-gate is unavailable
    await _publish(db_session, "gigsnano-work-item-executor")
    await _publish(db_session, "repo-context-loader")
    story = await _story(db_session, p, "Fix the login bug")
    await ep.resolve_and_persist(db_session, story, ws, story.title, "claude-code")
    with pytest.raises(LaunchBlocked, match="unavailable"):
        await prepare_launch(db_session, story, ws)
    assert await _run_count(db_session, story.id) == 0  # refused before any run created


async def test_gate_status_is_advisory(db_session, make_project):
    p = await make_project()
    ws = p.workspace_id
    await seed_skills(db_session)
    story = await _story(db_session, p)
    await ep.resolve_and_persist(db_session, story, ws, story.title, "claude-code")
    plan = await prepare_launch(db_session, story, ws)

    assert (await gate_status(db_session, plan.run_id, ["verification-gate"]))["passed"] is False
    await se.record_event(
        db_session, plan.run_id, skill_id="verification-gate", state=ESkillEventState.GATE_VERIFIED,
        dedupe_key="vg", evidence=[{"type": "pr", "ref": "#1"}],
    )
    assert (await gate_status(db_session, plan.run_id, ["verification-gate"]))["passed"] is True


async def test_completion_gate_no_profile_passes(db_session, make_project):
    p = await make_project()
    story = await _story(db_session, p)
    gate = await completion_gate(db_session, story, p.workspace_id)
    assert gate == {"passed": True, "missing": [], "run_id": None, "reason": "no execution profile"}


async def test_completion_gate_no_run_passes(db_session, make_project):
    p = await make_project()
    ws = p.workspace_id
    await seed_skills(db_session)
    story = await _story(db_session, p)
    await ep.resolve_and_persist(db_session, story, ws, story.title, "claude-code")
    gate = await completion_gate(db_session, story, ws)  # profile exists, no run yet
    assert gate["passed"] is True
    assert gate["run_id"] is None


async def test_completion_gate_surfaces_unverified_then_passes(db_session, make_project):
    p = await make_project()
    ws = p.workspace_id
    await seed_skills(db_session)
    story = await _story(db_session, p)
    await ep.resolve_and_persist(db_session, story, ws, story.title, "claude-code")
    plan = await prepare_launch(db_session, story, ws)  # creates the run

    gate = await completion_gate(db_session, story, ws)
    assert gate["passed"] is False
    assert "verification-gate" in gate["missing"]
    assert gate["run_id"] == plan.run_id

    # Verify every required skill with evidence → the advisory gate passes.
    for sid in gate["missing"]:
        await se.record_event(
            db_session, plan.run_id, skill_id=sid, state=ESkillEventState.GATE_VERIFIED,
            dedupe_key=f"{sid}-verified", evidence=[{"type": "pr", "ref": "#1"}],
        )
    assert (await completion_gate(db_session, story, ws))["passed"] is True
