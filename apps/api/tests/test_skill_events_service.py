from gigsnano_api.features.skill_events import service as S
from gigsnano_api.models.agent_runs import AgentRun
from gigsnano_api.models.skill_events import ESkillEventState
from gigsnano_api.models.stories import Story


async def _make_run(db, make_project):
    p = await make_project()
    story = Story(project_id=p.id, title="t")
    db.add(story)
    await db.flush()
    run = AgentRun(story_id=story.id, persona_id="agent_dev")
    db.add(run)
    await db.flush()
    return p, run


async def test_record_is_append_only_and_states_distinct(db_session, make_project):
    p, run = await _make_run(db_session, make_project)
    await S.record_event(db_session, run.id, skill_id="verification-gate",
                         state=ESkillEventState.MATERIALIZED, dedupe_key="k1")
    await S.record_event(db_session, run.id, skill_id="verification-gate",
                         state=ESkillEventState.AGENT_REPORTED_INVOKED, dedupe_key="k2")
    events = await S.list_events(db_session, run.id)
    assert len(events) == 2  # append-only, both retained
    states = await S.current_states(db_session, run.id)
    assert states["verification-gate"] == "agent_reported_invoked"  # latest wins


async def test_ingestion_is_idempotent(db_session, make_project):
    p, run = await _make_run(db_session, make_project)
    a = await S.record_event(db_session, run.id, skill_id="x",
                             state=ESkillEventState.SELECTED, dedupe_key="same")
    b = await S.record_event(db_session, run.id, skill_id="x",
                             state=ESkillEventState.SELECTED, dedupe_key="same")
    assert a.id == b.id
    assert len(await S.list_events(db_session, run.id)) == 1


async def test_gate_requires_evidence(db_session, make_project):
    p, run = await _make_run(db_session, make_project)
    req = ["verification-gate"]
    assert (await S.evaluate_gate(db_session, run.id, req, []))["passed"] is False
    # gate_verified with EMPTY evidence still fails
    await S.record_event(db_session, run.id, skill_id="verification-gate",
                         state=ESkillEventState.GATE_VERIFIED, dedupe_key="g1", evidence=[])
    assert (await S.evaluate_gate(db_session, run.id, req, []))["passed"] is False
    # with evidence -> passes
    await S.record_event(db_session, run.id, skill_id="verification-gate",
                         state=ESkillEventState.GATE_VERIFIED, dedupe_key="g2",
                         evidence=[{"type": "pr", "ref": "#1"}])
    res = await S.evaluate_gate(db_session, run.id, req, [])
    assert res["passed"] is True and res["missing"] == []


async def test_audit_reconstructs_pins(db_session, make_project):
    p, run = await _make_run(db_session, make_project)
    await S.record_event(db_session, run.id, skill_id="verification-gate",
                         state=ESkillEventState.DIGEST_VERIFIED, dedupe_key="d1",
                         version="1.2.0", digest="sha256:abc")
    a = await S.audit(db_session, run.id)
    pin = next(s for s in a["skills"] if s["skill_id"] == "verification-gate")
    assert pin["version"] == "1.2.0" and pin["digest"] == "sha256:abc"


async def test_metrics_are_tenant_scoped(db_session, make_project):
    p1, run1 = await _make_run(db_session, make_project)
    p2, run2 = await _make_run(db_session, make_project)  # different workspace
    await S.record_event(db_session, run1.id, skill_id="x",
                         state=ESkillEventState.FAILED, dedupe_key="f1")
    m1 = await S.metrics(db_session, p1.workspace_id)
    m2 = await S.metrics(db_session, p2.workspace_id)
    assert m1["skill_failure"] == 1
    assert m2["skill_failure"] == 0  # other workspace's event excluded
