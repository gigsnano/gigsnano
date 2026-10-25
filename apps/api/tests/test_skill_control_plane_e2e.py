"""Cross-agent end-to-end for the Agent Skill Control Plane (GIN-290).

Chains the whole plane for a UI-redesign work item: seed catalogue -> resolve +
persist the Execution Profile -> materialize the pinned skills for Claude Code,
Codex and Cursor (digest-verified) -> report delivery/verification events ->
pass the completion gate on real evidence -> reconstruct the audit. Plus the
supply-chain guarantee: a tampered bundle never materializes."""

import pytest

from gigsnano_api.features.execution_profiles import service as ep
from gigsnano_api.features.skills import bundle
from gigsnano_api.features.skills import service as registry
from gigsnano_api.features.skills.materialize import DigestMismatch, cleanup, materialize
from gigsnano_api.features.skills.seed import seed_skills
from gigsnano_api.features.skill_events import service as se
from gigsnano_api.models.agent_runs import AgentRun
from gigsnano_api.models.skill_events import ESkillEventState
from gigsnano_api.models.stories import Story

AGENTS = ("claude-code", "codex", "cursor")


async def _story(db, project, title):
    s = Story(project_id=project.id, title=title)
    db.add(s)
    await db.flush()
    return s


async def _version_ids(db, workspace_id, names):
    """Registry SkillVersion ids for the given skill names (latest per name)."""
    packages = {pkg.name: pkg for pkg in await registry.list_visible(db, workspace_id)}
    ids = []
    for name in names:
        versions = await registry.versions_for(db, packages[name].id)
        ids.append(versions[-1].id)
    return ids


async def test_ui_redesign_reaches_review_across_all_agents(db_session, make_project, monkeypatch, tmp_path):
    monkeypatch.setattr("gigsnano_api.workspace.paths.settings.workspace_base_path", str(tmp_path))
    await seed_skills(db_session)
    project = await make_project()
    ws = project.workspace_id
    story = await _story(db_session, project, "Redesign the button component design")

    # 1. Resolve + persist the Execution Profile — a design item pins the design skills.
    row = await ep.resolve_and_persist(db_session, story, ws, story.title, "claude-code")
    profile = ep.to_dict(row, stale=False)["profile"]
    assert profile["classification"]["work_type"] == "design"
    by = {s["skillId"]: s for s in profile["skills"]}
    assert by["ui-ux-design"]["status"] == "pinned"
    assert by["verification-gate"]["mode"] == "required" and by["verification-gate"]["status"] == "pinned"
    assert "accessibility" in profile["gates"]  # design work receives the accessibility gate
    assert not await ep.is_stale(db_session, row, ws, story.title)  # fresh

    required = [s["skillId"] for s in profile["skills"] if s["mode"] == "required" and s["status"] == "pinned"]
    version_ids = await _version_ids(db_session, ws, required)

    # 2. Materialize the SAME pinned versions for every agent; verify content on disk
    #    matches the recorded digest (materialize also re-verifies internally).
    run = AgentRun(story_id=story.id, persona_id="agent_ux")
    db_session.add(run)
    await db_session.flush()
    from gigsnano_api.workspace.paths import workspace_root

    for agent in AGENTS:
        run_id = f"e2e-{agent}"
        contract = await materialize(db_session, project.id, agent, version_ids, run_id=run_id)
        assert contract.agent == agent
        assert {s.name for s in contract.skills} == set(required)
        # read a materialized skill back off disk and confirm its digest
        root = workspace_root(project.id)
        vg = next(s for s in contract.skills if s.name == "verification-gate")
        files = {"SKILL.md": (root / vg.path / "SKILL.md").read_text(encoding="utf-8")}
        assert bundle.content_digest(files) == vg.digest
        cleanup(project.id, run_id)  # ephemeral materialization removed

    # 3. Report delivery -> verification events with real evidence.
    for name in required:
        await se.record_event(db_session, run.id, skill_id=name,
                              state=ESkillEventState.MATERIALIZED, dedupe_key=f"{name}-mat")
    await se.record_event(
        db_session, run.id, skill_id="verification-gate", state=ESkillEventState.GATE_VERIFIED,
        dedupe_key="vg-gate", gate="accessibility",
        evidence=[{"type": "visual", "ref": "screenshot"}, {"type": "accessibility", "ref": "axe-report"}],
    )

    # 4. Completion gate passes only on that cited evidence; audit reconstructs the pin.
    gate = await se.evaluate_gate(db_session, run.id, ["verification-gate"], ["accessibility"])
    assert gate["passed"] is True
    audit = await se.audit(db_session, run.id)
    vg_audit = next(s for s in audit["skills"] if s["skill_id"] == "verification-gate")
    assert vg_audit["states"][-1] == "gate_verified"  # verified, not merely delivered


async def test_tampered_bundle_never_materializes(db_session, make_project, monkeypatch, tmp_path):
    monkeypatch.setattr("gigsnano_api.workspace.paths.settings.workspace_base_path", str(tmp_path))
    project = await make_project()
    ws = project.workspace_id
    ver = await registry.publish(
        db_session, workspace_id=ws, name="verification-gate", version="1.0.0", visibility="private",
        files={"SKILL.md": "---\nname: verification-gate\ndescription: x\n---\n"}, manifest={},
    )
    # Corrupt the stored bundle bytes; the digest column is unchanged.
    ver.data = bundle.build_tgz({"SKILL.md": "tampered\n"})
    await db_session.flush()
    story = await _story(db_session, project, "run it")
    with pytest.raises(DigestMismatch):
        await materialize(db_session, project.id, "claude-code", [ver.id], run_id="tamper")
    from gigsnano_api.workspace.paths import workspace_root

    assert not (workspace_root(project.id) / ".claude").exists()  # nothing written
