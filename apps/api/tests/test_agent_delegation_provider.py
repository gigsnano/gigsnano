import pytest

from gigsnano_api.agent_delegation.provider import (
    DelegationContext,
    FakeAgentProvider,
    build_default_agent_provider,
)
from gigsnano_api.models import EDelegationStatus, EDelegationUnit


@pytest.mark.asyncio
async def test_fake_follow_work_item_ends_completed_with_pr():
    ctx = DelegationContext(
        unit_type=EDelegationUnit.WORK_ITEM,
        title="Fix bug",
        description="",
        repo_full_name="acme/app",
        custom_prompt=None,
    )
    provider = FakeAgentProvider()
    events = [e async for e in provider.follow(ctx, external_ref=None)]
    statuses = [e.status for e in events]
    assert statuses[0] == EDelegationStatus.QUEUED
    assert EDelegationStatus.RUNNING in statuses
    assert EDelegationStatus.AWAITING_REVIEW in statuses
    assert statuses[-1] == EDelegationStatus.COMPLETED
    assert events[-1].result["kind"] == "pr"
    assert events[-1].result["pr_url"].startswith("http")


@pytest.mark.asyncio
async def test_fake_follow_bmad_card_ends_completed_with_document():
    ctx = DelegationContext(
        unit_type=EDelegationUnit.BMAD_CARD,
        title="PRD",
        description="",
        repo_full_name=None,
        custom_prompt=None,
    )
    events = [e async for e in FakeAgentProvider().follow(ctx, external_ref=None)]
    assert events[-1].status == EDelegationStatus.COMPLETED
    assert events[-1].result["kind"] == "document"


def test_default_provider_is_fake_without_creds():
    assert isinstance(build_default_agent_provider(), FakeAgentProvider)
