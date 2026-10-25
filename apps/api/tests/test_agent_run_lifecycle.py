import pytest

from gigsnano_api.features.agent_runs import service
from gigsnano_api.features.agent_runs.lifecycle import assert_transition, can_transition
from gigsnano_api.models.agent_runs import (
    EAgentAutonomy,
    EAgentRunStepKind,
)
from gigsnano_api.models.agent_runs import (
    EAgentRunState as S,
)
from gigsnano_api.models.stories import Story


def test_legal_transitions():
    assert can_transition(S.QUEUED, S.PLANNING)
    assert can_transition(S.PLANNING, S.EXECUTING)
    assert can_transition(S.EXECUTING, S.AWAITING_REVIEW)
    assert can_transition(S.AWAITING_REVIEW, S.DONE)
    assert can_transition(S.AWAITING_REVIEW, S.EXECUTING)  # reject -> rework
    assert can_transition(S.FAILED, S.QUEUED)  # retry


def test_illegal_transitions():
    assert not can_transition(S.QUEUED, S.DONE)  # can't skip execution
    assert not can_transition(S.DONE, S.EXECUTING)  # terminal
    assert not can_transition(S.EXECUTING, S.QUEUED)  # no reverse
    with pytest.raises(ValueError, match="illegal agent-run transition"):
        assert_transition(S.QUEUED, S.DONE)


async def _story(db, project):
    s = Story(project_id=project.id, title="Task", story_number=1)
    db.add(s)
    await db.flush()
    return s


async def test_create_run_persists_queued(db_session, make_project):
    project = await make_project()
    story = await _story(db_session, project)
    run = await service.create_run(
        db_session, story_id=story.id, persona_id="agent_dev", autonomy=EAgentAutonomy.AUTOPILOT
    )
    assert run.state == S.QUEUED
    assert run.persona_id == "agent_dev"
    assert run.autonomy == EAgentAutonomy.AUTOPILOT
    assert run.cost_tokens == 0


async def test_steps_are_ordered_and_accumulate_cost(db_session, make_project):
    project = await make_project()
    story = await _story(db_session, project)
    run = await service.create_run(db_session, story_id=story.id, persona_id="agent_dev")

    s0 = await service.add_step(db_session, run, kind=EAgentRunStepKind.PLAN, summary="plan", tokens=100)
    s1 = await service.add_step(db_session, run, kind=EAgentRunStepKind.TOOL, summary="edit", tokens=250)
    assert (s0.seq, s1.seq) == (0, 1)
    assert run.cost_tokens == 350


async def test_advance_run_enforces_state_machine(db_session, make_project):
    project = await make_project()
    story = await _story(db_session, project)
    run = await service.create_run(db_session, story_id=story.id, persona_id="agent_dev")

    await service.advance_run(db_session, run, S.PLANNING)
    await service.advance_run(db_session, run, S.EXECUTING)
    assert run.state == S.EXECUTING

    with pytest.raises(ValueError):
        await service.advance_run(db_session, run, S.QUEUED)  # illegal reverse
