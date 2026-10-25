from gigsnano_api.agent.runner import AgentText, AgentToolCall, AgentToolConfirm
from gigsnano_api.features.agent_runs import service
from gigsnano_api.features.agent_runs.orchestrator import orchestrate
from gigsnano_api.models.agent_runs import EAgentAutonomy, EAgentRunStepKind
from gigsnano_api.models.agent_runs import EAgentRunState as S
from gigsnano_api.models.stories import Story


async def _events(*evs):
    for e in evs:
        yield e


async def _run(db, make_project, autonomy):
    project = await make_project()
    story = Story(project_id=project.id, title="Task", story_number=1)
    db.add(story)
    await db.flush()
    return await service.create_run(db, story_id=story.id, persona_id="agent_dev", autonomy=autonomy)


async def _steps(db, run):
    from sqlalchemy import select

    from gigsnano_api.models.agent_runs import AgentRunStep

    rows = (
        await db.execute(
            select(AgentRunStep).where(AgentRunStep.run_id == run.id).order_by(AgentRunStep.seq)
        )
    ).scalars().all()
    return [(r.kind, r.status) for r in rows]


async def test_readonly_finish_draft_awaits_review(db_session, make_project):
    run = await _run(db_session, make_project, EAgentAutonomy.DRAFT)
    await orchestrate(db_session, run, _events(AgentText("done, here is the summary")))
    assert run.state == S.AWAITING_REVIEW
    kinds = [k for k, _ in await _steps(db_session, run)]
    assert kinds == [EAgentRunStepKind.PLAN, EAgentRunStepKind.ARTIFACT]


async def test_readonly_finish_autopilot_completes(db_session, make_project):
    run = await _run(db_session, make_project, EAgentAutonomy.AUTOPILOT)
    await orchestrate(
        db_session, run, _events(AgentToolCall("1", "search", {}), AgentText("summary"))
    )
    assert run.state == S.DONE
    kinds = [k for k, _ in await _steps(db_session, run)]
    assert EAgentRunStepKind.TOOL in kinds
    assert kinds[-1] == EAgentRunStepKind.ARTIFACT


async def test_mutating_confirm_gates_to_review(db_session, make_project):
    run = await _run(db_session, make_project, EAgentAutonomy.DRAFT)
    await orchestrate(
        db_session,
        run,
        _events(AgentToolCall("1", "edit_file", {}), AgentToolConfirm("1", "edit_file", {"path": "a"})),
    )
    assert run.state == S.AWAITING_REVIEW
    steps = await _steps(db_session, run)
    assert (EAgentRunStepKind.NOTE, "awaiting_approval") in steps


async def test_error_in_stream_fails_run(db_session, make_project):
    run = await _run(db_session, make_project, EAgentAutonomy.AUTOPILOT)

    async def _boom():
        yield AgentToolCall("1", "edit", {})
        raise RuntimeError("provider exploded")

    await orchestrate(db_session, run, _boom())
    assert run.state == S.FAILED
    steps = await _steps(db_session, run)
    assert any(status == "error" for _, status in steps)
