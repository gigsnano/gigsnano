"""GIN-250 live execution — the fresh-session runner drives a queued run against
the (fake) LLM to a review gate, records cost as an LlmUsageEvent, and the boot
reaper fails only actively-writing runs. Hermetic: async_session + provider are
patched to the test DB / FakeProvider so nothing touches prod or a real key.
"""

from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from gigsnano_api.auth.models import User
from gigsnano_api.bmad.provider import FakeProvider
from gigsnano_api.features.agent_runs import live, service
from gigsnano_api.models import ELlmUsageSource, LlmUsageEvent
from gigsnano_api.models.agent_runs import AgentRun, AgentRunStep, EAgentAutonomy
from gigsnano_api.models.agent_runs import EAgentRunState as S
from gigsnano_api.models.agent_runs import EAgentRunStepKind
from gigsnano_api.models.stories import Story


async def _seed(db, make_project):
    project = await make_project()
    user = User(id=str(uuid4()), email=f"{uuid4().hex}@t.test", display_name="U", password_hash="x")
    story = Story(project_id=project.id, title="Ship the thing", story_number=1)
    db.add_all([user, story])
    await db.flush()
    run = await service.create_run(db, story_id=story.id, persona_id="agent_dev",
                                   autonomy=EAgentAutonomy.DRAFT)
    await db.commit()
    return run, user, project.workspace_id


async def test_live_run_executes_to_review_and_bills(db_session, make_project, monkeypatch):
    run, user, ws_id = await _seed(db_session, make_project)
    monkeypatch.setattr(live, "async_session", async_sessionmaker(db_session.bind, expire_on_commit=False))
    monkeypatch.setattr(live, "build_default_provider", lambda: FakeProvider())

    run_id, user_id = run.id, user.id
    await live.run_agent_run_in_fresh_session(run_id, user_id=user_id, workspace_id=ws_id)

    db_session.expire_all()
    run = await db_session.get(AgentRun, run_id)
    assert run.state == S.AWAITING_REVIEW          # draft finish awaits review
    assert run.cost_tokens == 30                    # one fake round: 10 in + 20 out

    steps = (await db_session.execute(
        select(AgentRunStep).where(AgentRunStep.run_id == run.id).order_by(AgentRunStep.seq)
    )).scalars().all()
    assert [s.kind for s in steps] == [EAgentRunStepKind.PLAN, EAgentRunStepKind.ARTIFACT]

    events = (await db_session.execute(
        select(LlmUsageEvent).where(LlmUsageEvent.source == ELlmUsageSource.AGENT_RUN)
    )).scalars().all()
    assert len(events) == 1
    assert events[0].total_tokens == 30
    assert events[0].user_id == user_id


async def test_reaper_fails_only_active_runs(db_session, make_project):
    project = await make_project()
    story = Story(project_id=project.id, title="T", story_number=1)
    db_session.add(story)
    await db_session.flush()

    states = [S.QUEUED, S.PLANNING, S.EXECUTING, S.AWAITING_REVIEW]
    runs = []
    for st in states:
        r = AgentRun(story_id=story.id, persona_id="agent_dev", autonomy=EAgentAutonomy.DRAFT, state=st)
        db_session.add(r)
        runs.append(r)
    await db_session.commit()

    reaped = await live.reap_interrupted_runs(db_session)
    assert reaped == 2  # PLANNING + EXECUTING only

    # reap loads the same identity-map instances; expire_on_commit is off, so the
    # in-memory objects already reflect the change — no re-fetch (no lazy-load IO).
    assert {r.state for r in runs} == {S.QUEUED, S.FAILED, S.AWAITING_REVIEW}
