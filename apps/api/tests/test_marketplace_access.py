"""Tests for marketplace subtree helpers and resolve_work_item_access."""

from uuid import uuid4

import pytest

from gigsnano_api.auth.models import User
from gigsnano_api.marketplace.access import EWorkItemAccessLevel, resolve_work_item_access
from gigsnano_api.marketplace.subtree import story_ids_in_subtree, story_in_subtree
from gigsnano_api.models import (
    Bid,
    Contract,
    ContractAccess,
    EContractStatus,
    EListingStatus,
    EMemberStatus,
    EStoryStatus,
    EWorkspaceRole,
    MarketplaceListing,
    Story,
    WorkspaceMember,
)


def _story(id_: str, project_id: str, parent_id: str | None = None, cycle_id: str | None = None):
    return Story(
        id=id_,
        project_id=project_id,
        parent_id=parent_id,
        cycle_id=cycle_id,
        title=f"Story {id_}",
        status=EStoryStatus.TODO,
    )


def test_story_ids_in_subtree_includes_descendants():
    stories = [
        _story("epic", "p1"),
        _story("child", "p1", parent_id="epic"),
        _story("grand", "p1", parent_id="child"),
        _story("other", "p1"),
    ]
    covered = story_ids_in_subtree("epic", stories)
    assert covered == {"epic", "child", "grand"}
    assert not story_in_subtree("other", "epic", stories)


async def _seed_contract_access(
    db_session,
    *,
    workspace,
    project,
    freelancer: User,
    root_story: Story | None = None,
    root_cycle_id: str | None = None,
    contract_status=EContractStatus.IN_PROGRESS,
    active=True,
):
    listing = MarketplaceListing(
        workspace_id=workspace.id,
        story_id=root_story.id if root_story else None,
        cycle_id=root_cycle_id,
        title="Listing",
        description="",
        status=EListingStatus.AWARDED,
        posted_by_id=freelancer.id,
    )
    db_session.add(listing)
    await db_session.flush()

    bid = Bid(
        listing_id=listing.id,
        bidder_id=freelancer.id,
        amount_cents=1000,
        message="I can do it",
    )
    db_session.add(bid)
    await db_session.flush()

    contract = Contract(
        listing_id=listing.id,
        bid_id=bid.id,
        freelancer_id=freelancer.id,
        workspace_id=workspace.id,
        bid_cents=1000,
        fee_cents=200,
        hold_txn_id=str(uuid4()),
        status=contract_status,
    )
    db_session.add(contract)
    await db_session.flush()

    access = ContractAccess(
        contract_id=contract.id,
        user_id=freelancer.id,
        root_story_id=root_story.id if root_story else None,
        root_cycle_id=root_cycle_id,
        active=active,
    )
    db_session.add(access)
    await db_session.commit()
    return contract, access


@pytest.fixture
async def marketplace_fixtures(db_session, make_workspace, make_user, make_project):
    owner = make_user(email="owner@test.com")
    freelancer = make_user(email="freelancer@test.com")
    db_session.add_all([owner, freelancer])
    await db_session.flush()

    ws = await make_workspace(slug="acme")
    db_session.add(
        WorkspaceMember(
            workspace_id=ws.id,
            user_id=owner.id,
            role=EWorkspaceRole.OWNER,
            status=EMemberStatus.ACTIVE,
        )
    )
    project = await make_project(workspace_id=ws.id, name="App")
    epic = Story(id="epic-1", project_id=project.id, title="Epic", status=EStoryStatus.TODO)
    child = Story(
        id="child-1",
        project_id=project.id,
        parent_id="epic-1",
        title="Child",
        status=EStoryStatus.TODO,
    )
    sibling = Story(id="sib-1", project_id=project.id, title="Sibling", status=EStoryStatus.TODO)
    db_session.add_all([epic, child, sibling])
    await db_session.commit()

    return {
        "owner": owner,
        "freelancer": freelancer,
        "workspace": ws,
        "project": project,
        "epic": epic,
        "child": child,
        "sibling": sibling,
    }


async def test_member_gets_full_access(marketplace_fixtures, db_session):
    fx = marketplace_fixtures
    access = await resolve_work_item_access(db_session, fx["owner"].id, fx["child"].id)
    assert access.level == EWorkItemAccessLevel.MEMBER
    assert access.workspace_id == fx["workspace"].id


async def test_contractor_gets_scoped_access_to_subtree(marketplace_fixtures, db_session):
    fx = marketplace_fixtures
    await _seed_contract_access(
        db_session,
        workspace=fx["workspace"],
        project=fx["project"],
        freelancer=fx["freelancer"],
        root_story=fx["epic"],
    )
    child_access = await resolve_work_item_access(
        db_session, fx["freelancer"].id, fx["child"].id
    )
    assert child_access.level == EWorkItemAccessLevel.CONTRACTOR
    assert child_access.contract_id is not None

    sibling_access = await resolve_work_item_access(
        db_session, fx["freelancer"].id, fx["sibling"].id
    )
    assert sibling_access.level == EWorkItemAccessLevel.NONE


async def test_contractor_access_revoked_when_not_in_progress(marketplace_fixtures, db_session):
    fx = marketplace_fixtures
    await _seed_contract_access(
        db_session,
        workspace=fx["workspace"],
        project=fx["project"],
        freelancer=fx["freelancer"],
        root_story=fx["epic"],
        contract_status=EContractStatus.COMPLETED,
    )
    access = await resolve_work_item_access(db_session, fx["freelancer"].id, fx["child"].id)
    assert access.level == EWorkItemAccessLevel.NONE


async def test_contractor_access_revoked_when_inactive(marketplace_fixtures, db_session):
    fx = marketplace_fixtures
    await _seed_contract_access(
        db_session,
        workspace=fx["workspace"],
        project=fx["project"],
        freelancer=fx["freelancer"],
        root_story=fx["epic"],
        active=False,
    )
    access = await resolve_work_item_access(db_session, fx["freelancer"].id, fx["child"].id)
    assert access.level == EWorkItemAccessLevel.NONE


async def test_unknown_story_returns_none(db_session, make_user):
    user = make_user()
    db_session.add(user)
    await db_session.commit()
    access = await resolve_work_item_access(db_session, user.id, "missing-story")
    assert access.level == EWorkItemAccessLevel.NONE
