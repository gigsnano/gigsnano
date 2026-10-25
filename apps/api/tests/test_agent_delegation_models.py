from gigsnano_api.models import (
    AgentConnection,
    Delegation,
    EAgentConnectionStatus,
    EAgentProvider,
    EDelegationStatus,
    EDelegationUnit,
)


def test_enum_values_match_frontend_contract():
    assert EAgentProvider.CURSOR.value == "cursor"
    assert EAgentProvider.CODEX.value == "codex"
    assert EAgentProvider.CLAUDE_CODE.value == "claude_code"
    assert EDelegationStatus.AWAITING_REVIEW.value == "awaiting_review"
    assert EDelegationUnit.WORK_ITEM.value == "work_item"
    assert EAgentConnectionStatus.CONNECTED.value == "connected"


async def test_tables_registered(db_session):
    assert AgentConnection.__tablename__ == "agent_connections"
    assert Delegation.__tablename__ == "delegations"
    # Defaults are sane for a freshly-created delegation row. mapped_column(default=...)
    # only applies at flush/INSERT time (not at __init__), matching every other model
    # in this codebase (see test_pm_models.py, test_sync_models.py, test_models.py) —
    # so this flushes before asserting, rather than checking the bare constructed object.
    d = Delegation(
        unit_type=EDelegationUnit.WORK_ITEM,
        unit_id="s1",
        project_id="p1",
        workspace_id="w1",
        provider=EAgentProvider.CURSOR,
        connection_id="agc1",
        delegated_by="u1",
    )
    db_session.add(d)
    await db_session.flush()
    assert d.status == EDelegationStatus.QUEUED
