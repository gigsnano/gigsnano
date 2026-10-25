from uuid import uuid4

import pytest
from sqlalchemy import select

from gigsnano_api.agent.tools.base import Tool, ToolContext, ToolRegistry, ToolResult
from gigsnano_api.agent.tools.work_items import (
    QUERY_WORK_ITEMS,
    build_work_item_registry,
    create_work_item,
    query_work_items,
    update_work_item,
)
from gigsnano_api.auth.models import User
from gigsnano_api.models import (
    EMemberStatus,
    EProjectRole,
    EStoryPriority,
    EStoryStatus,
    EWorkspaceRole,
    Project,
    ProjectMember,
    Story,
    Workspace,
    WorkspaceMember,
)


async def _noop(ctx, args):
    return ToolResult("ok")


def test_registry_defs_and_lookup():
    t = Tool(name="q", description="d", input_schema={"type": "object", "properties": {}}, handler=_noop)
    reg = ToolRegistry([t])
    defs = reg.anthropic_defs()
    assert defs == [{"name": "q", "description": "d", "input_schema": {"type": "object", "properties": {}}}]
    assert reg.get("q") is t and reg.get("missing") is None


@pytest.mark.asyncio
async def test_query_work_items_counts_and_scopes(db_session):
    workspace = Workspace(slug=f"ws-{uuid4().hex[:8]}", name="Test Workspace")
    user = User(email="member@test.com", display_name="Member", password_hash="x")
    db_session.add_all([workspace, user])
    await db_session.flush()

    project_a = Project(
        workspace_id=workspace.id, name="Alpha", identifier="ALP", cover_image_url="x"
    )
    project_b = Project(
        workspace_id=workspace.id, name="Beta", identifier="BET", cover_image_url="x"
    )
    db_session.add_all([project_a, project_b])
    await db_session.flush()

    db_session.add_all(
        [
            WorkspaceMember(
                workspace_id=workspace.id,
                user_id=user.id,
                role=EWorkspaceRole.MEMBER,
                status=EMemberStatus.ACTIVE,
            ),
            # User is only a member of project_a — project_b's stories must stay hidden.
            ProjectMember(
                project_id=project_a.id,
                user_id=user.id,
                status=EMemberStatus.ACTIVE,
            ),
        ]
    )
    db_session.add_all(
        [
            Story(
                project_id=project_a.id,
                title="Fix login bug",
                status=EStoryStatus.IN_PROGRESS,
                priority=EStoryPriority.HIGH,
                story_number=1,
                assignee_id=user.id,
            ),
            Story(
                project_id=project_a.id,
                title="Write docs",
                status=EStoryStatus.TODO,
                priority=EStoryPriority.LOW,
                story_number=2,
            ),
            # Not accessible: lives in project_b, which this user can't see.
            Story(
                project_id=project_b.id,
                title="Secret roadmap item",
                status=EStoryStatus.TODO,
                priority=EStoryPriority.MEDIUM,
                story_number=1,
            ),
        ]
    )
    await db_session.commit()

    ctx = ToolContext(db=db_session, workspace=workspace, user=user, role="member")
    result = await query_work_items(ctx, {})

    assert not result.is_error
    assert "Total matching: 2" in result.content
    assert "ALP-1" in result.content
    assert "ALP-2" in result.content
    assert "Secret roadmap item" not in result.content
    assert result.summary == "Found 2"


async def _setup_member_and_project(db_session, *, project_name="Alpha", identifier="ALP"):
    """Shared fixture-lite: one workspace, one active member, one project they belong to."""
    workspace = Workspace(slug=f"ws-{uuid4().hex[:8]}", name="Test Workspace")
    user = User(email=f"{uuid4().hex[:8]}@test.com", display_name="Member", password_hash="x")
    db_session.add_all([workspace, user])
    await db_session.flush()

    project = Project(
        workspace_id=workspace.id, name=project_name, identifier=identifier, cover_image_url="x"
    )
    db_session.add(project)
    await db_session.flush()

    db_session.add_all(
        [
            WorkspaceMember(
                workspace_id=workspace.id,
                user_id=user.id,
                role=EWorkspaceRole.MEMBER,
                status=EMemberStatus.ACTIVE,
            ),
            ProjectMember(project_id=project.id, user_id=user.id, status=EMemberStatus.ACTIVE),
        ]
    )
    await db_session.commit()
    return workspace, user, project


@pytest.mark.asyncio
async def test_create_work_item_inserts(db_session):
    workspace, user, project = await _setup_member_and_project(db_session)

    ctx = ToolContext(db=db_session, workspace=workspace, user=user, role="member")
    result = await create_work_item(
        ctx,
        {
            "project": "Alpha",
            "title": "New task",
            "priority": "high",
            "description": "## Goal\n- one\n- two",
        },
    )

    assert not result.is_error
    assert "ALP-1" in result.content
    assert result.summary == "Created ALP-1"

    story = (
        await db_session.execute(select(Story).where(Story.project_id == project.id))
    ).scalar_one()
    assert story.title == "New task"
    assert story.status == EStoryStatus.TODO
    assert story.priority == EStoryPriority.HIGH
    assert story.story_number == 1
    # GIN-29: Markdown description is stored as HTML, not raw text.
    assert story.description == "<h2>Goal</h2><ul><li>one</li><li>two</li></ul>"


@pytest.mark.asyncio
async def test_update_work_item_applies(db_session):
    workspace, user, project = await _setup_member_and_project(db_session)
    story = Story(
        project_id=project.id,
        title="Old title",
        status=EStoryStatus.TODO,
        priority=EStoryPriority.LOW,
        story_number=1,
    )
    db_session.add(story)
    await db_session.commit()

    ctx = ToolContext(db=db_session, workspace=workspace, user=user, role="member")
    result = await update_work_item(
        ctx, {"code": "ALP-1", "status": "in_progress", "priority": "high", "assignee": "me"}
    )

    assert not result.is_error
    assert result.summary == "Updated ALP-1"

    await db_session.refresh(story)
    assert story.status == EStoryStatus.IN_PROGRESS
    assert story.priority == EStoryPriority.HIGH
    assert story.assignee_id == user.id


@pytest.mark.asyncio
async def test_create_denied_project_is_error(db_session):
    workspace, user, _project_a = await _setup_member_and_project(db_session)
    project_b = Project(
        workspace_id=workspace.id, name="Beta", identifier="BET", cover_image_url="x"
    )
    db_session.add(project_b)
    await db_session.commit()

    ctx = ToolContext(db=db_session, workspace=workspace, user=user, role="member")
    result = await create_work_item(ctx, {"project": "Beta", "title": "Sneaky"})

    assert result.is_error


async def _setup_viewer_and_project(db_session):
    """One workspace, one active member who is a project-scoped VIEWER (read-only)."""
    workspace = Workspace(slug=f"ws-{uuid4().hex[:8]}", name="Test Workspace")
    user = User(email=f"{uuid4().hex[:8]}@test.com", display_name="Viewer", password_hash="x")
    db_session.add_all([workspace, user])
    await db_session.flush()

    project = Project(
        workspace_id=workspace.id, name="Alpha", identifier="ALP", cover_image_url="x"
    )
    db_session.add(project)
    await db_session.flush()

    db_session.add_all(
        [
            WorkspaceMember(
                workspace_id=workspace.id,
                user_id=user.id,
                role=EWorkspaceRole.MEMBER,
                status=EMemberStatus.ACTIVE,
            ),
            ProjectMember(
                project_id=project.id,
                user_id=user.id,
                role=EProjectRole.VIEWER,
                status=EMemberStatus.ACTIVE,
            ),
        ]
    )
    await db_session.commit()
    return workspace, user, project


@pytest.mark.asyncio
async def test_create_work_item_rejects_project_viewer(db_session):
    workspace, user, _project = await _setup_viewer_and_project(db_session)

    ctx = ToolContext(db=db_session, workspace=workspace, user=user, role="member")
    result = await create_work_item(ctx, {"project": "Alpha", "title": "Sneaky"})

    assert result.is_error
    stories = (await db_session.execute(select(Story))).scalars().all()
    assert stories == []


@pytest.mark.asyncio
async def test_update_work_item_rejects_project_viewer(db_session):
    workspace, user, project = await _setup_viewer_and_project(db_session)
    story = Story(
        project_id=project.id,
        title="Old title",
        status=EStoryStatus.TODO,
        priority=EStoryPriority.LOW,
        story_number=1,
    )
    db_session.add(story)
    await db_session.commit()

    ctx = ToolContext(db=db_session, workspace=workspace, user=user, role="member")
    result = await update_work_item(ctx, {"code": "ALP-1", "status": "in_progress"})

    assert result.is_error
    await db_session.refresh(story)
    assert story.status == EStoryStatus.TODO


@pytest.mark.asyncio
async def test_update_work_item_rejects_locked_bmad_story(db_session):
    workspace, user, project = await _setup_member_and_project(db_session)
    story = Story(
        project_id=project.id,
        title="Draft PRD",
        status=EStoryStatus.TODO,
        priority=EStoryPriority.LOW,
        story_number=1,
        bmad_workflow="prd",
        bmad_is_locked=True,
    )
    db_session.add(story)
    await db_session.commit()

    ctx = ToolContext(db=db_session, workspace=workspace, user=user, role="member")
    result = await update_work_item(ctx, {"code": "ALP-1", "status": "in_progress"})

    assert result.is_error
    await db_session.refresh(story)
    assert story.status == EStoryStatus.TODO


@pytest.mark.asyncio
async def test_update_work_item_rejects_non_member_assignee(db_session):
    workspace, user, project = await _setup_member_and_project(db_session)
    story = Story(
        project_id=project.id,
        title="Old title",
        status=EStoryStatus.TODO,
        priority=EStoryPriority.LOW,
        story_number=1,
    )
    db_session.add(story)
    await db_session.commit()

    ctx = ToolContext(db=db_session, workspace=workspace, user=user, role="member")
    result = await update_work_item(ctx, {"code": "ALP-1", "assignee": "not-a-real-user-id"})

    assert result.is_error
    await db_session.refresh(story)
    assert story.assignee_id is None


def test_build_work_item_registry_has_all_three_tools():
    reg = build_work_item_registry()
    names = {d["name"] for d in reg.anthropic_defs()}
    assert names == {"query_work_items", "create_work_item", "update_work_item"}
    assert reg.get("query_work_items") is QUERY_WORK_ITEMS
    assert reg.get("create_work_item").mutating is True
    assert reg.get("update_work_item").mutating is True


@pytest.mark.asyncio
async def test_create_work_item_after_trashing_highest_number(db_session):
    """GigsAI's create tool shares `_insert_story`, so it hit the same dead
    story-number sequence: trashing the top item made every later create fail
    with "Could not allocate a story number" until the agent burned its rounds."""
    from datetime import datetime, timezone

    workspace, user, project = await _setup_member_and_project(db_session)
    ctx = ToolContext(db=db_session, workspace=workspace, user=user, role="member")

    first = await create_work_item(ctx, {"project": "Alpha", "title": "Top"})
    assert "ALP-1" in first.content

    story = (
        await db_session.execute(select(Story).where(Story.story_number == 1))
    ).scalar_one()
    story.deleted_at = datetime.now(timezone.utc)
    await db_session.commit()

    second = await create_work_item(ctx, {"project": "Alpha", "title": "Next"})
    assert not second.is_error, second.content
    assert "ALP-2" in second.content
