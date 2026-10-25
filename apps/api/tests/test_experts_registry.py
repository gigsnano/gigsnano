from gigsnano_api.features.experts.registry import get_expert, list_experts
from gigsnano_api.models import Agent


async def test_experts_come_from_the_agents_table(db_session, make_workspace):
    ws = await make_workspace()
    db_session.add(Agent(workspace_id=ws.id, name="Finance", persona="Ravi",
                         domain="finance", avatar_color="#123456",
                         instructions="Watch the budget.", bundles=["spend_time"]))
    await db_session.commit()

    experts = await list_experts(db_session, ws.id)
    finance = next(e for e in experts if e.name == "Finance")
    assert finance.domain == "finance"
    assert finance.avatar_color == "#123456"
    assert finance.system_prompt == "Watch the budget."
    assert finance.bundles == ("spend_time",)

    assert (await get_expert(db_session, ws.id, finance.id)).name == "Finance"
    assert await get_expert(db_session, ws.id, "no-such-id") is None


async def test_disabled_agents_are_not_offered(db_session, make_workspace):
    ws = await make_workspace()
    db_session.add(Agent(workspace_id=ws.id, name="Retired", bundles=[], enabled=False))
    await db_session.commit()
    assert [e.name for e in await list_experts(db_session, ws.id)] == []
