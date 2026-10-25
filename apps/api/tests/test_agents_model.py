from sqlalchemy import select

from gigsnano_api.models import Agent


async def test_agent_defaults_and_json_bundles(db_session, make_workspace):
    ws = await make_workspace()
    db_session.add(Agent(workspace_id=ws.id, name="Finance", persona="Ravi",
                         domain="finance", instructions="Watch the budget.",
                         bundles=["spend_time", "project_health"]))
    await db_session.commit()

    agent = (await db_session.execute(select(Agent))).scalars().one()
    assert agent.bundles == ["spend_time", "project_health"]
    assert agent.is_builtin is False
    assert agent.enabled is True
    assert agent.project_id is None
    assert agent.avatar_color == "#6b7280"
    assert agent.voice_id == ""
