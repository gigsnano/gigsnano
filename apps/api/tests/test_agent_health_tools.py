from uuid import uuid4

from gigsnano_api.agent.tools.base import ToolContext
from gigsnano_api.agent.tools.health import build_health_tools
from gigsnano_api.models import EBlockerStatus, Project, WorkItemBlocker


async def test_health_summary_names_the_project_and_survives_no_data(
    db_session, make_workspace, make_user
):
    ws = await make_workspace()
    user = make_user()
    db_session.add(user)
    await db_session.commit()

    tool = build_health_tools().get("project_health_summary")
    assert tool is not None and tool.mutating is False

    result = await tool.handler(
        ToolContext(db=db_session, workspace=ws, user=user, role="owner", project_id=None), {}
    )
    # No project in scope is a normal question to ask badly, not an exception.
    assert result.is_error is True
    assert "project" in result.content.lower()


async def test_health_summary_reports_no_data_for_a_fresh_project(
    db_session, make_workspace, make_user
):
    ws = await make_workspace()
    user = make_user()
    project = Project(
        workspace_id=ws.id, name="Alpha", identifier="ALP", cover_image_url="x"
    )
    db_session.add_all([user, project])
    await db_session.commit()

    tool = build_health_tools().get("project_health_summary")
    assert tool is not None
    result = await tool.handler(
        ToolContext(db=db_session, workspace=ws, user=user, role="owner", project_id=project.id), {}
    )
    assert result.is_error is False
    # A brand-new project has no forecast history yet — `compute_health` reports
    # that as low ("no_data") confidence rather than fabricating a status.
    assert "no_data" in result.content.lower()
    assert "Alpha" in result.content


async def test_health_summary_rejects_a_project_from_another_workspace(
    db_session, make_workspace, make_user
):
    ws = await make_workspace()
    other_ws = await make_workspace()
    user = make_user()
    other_project = Project(
        workspace_id=other_ws.id, name="Bravo", identifier="BRV", cover_image_url="x"
    )
    db_session.add_all([user, other_project])
    await db_session.commit()

    tool = build_health_tools().get("project_health_summary")
    assert tool is not None
    result = await tool.handler(
        ToolContext(db=db_session, workspace=ws, user=user, role="owner", project_id=other_project.id),
        {},
    )
    # Tenant isolation: a project id from a different workspace must not resolve.
    assert result.is_error is True


async def test_health_summary_rejects_a_non_member_in_the_same_workspace(
    db_session, make_workspace, make_user
):
    """A plain workspace member with no ProjectMember row on THIS project must be
    refused exactly like 'no project in scope' — the same rule get_project_or_404
    enforces over HTTP (GIN project-scoped-access). Not a distinct 'no access'
    message: confirming the project exists but isn't theirs leaks it."""
    ws = await make_workspace()
    user = make_user()
    project = Project(
        workspace_id=ws.id, name="Alpha", identifier="ALP", cover_image_url="x"
    )
    db_session.add_all([user, project])
    await db_session.commit()

    tool = build_health_tools().get("project_health_summary")
    assert tool is not None
    result = await tool.handler(
        ToolContext(db=db_session, workspace=ws, user=user, role="member", project_id=project.id),
        {},
    )
    assert result.is_error is True
    assert "project" in result.content.lower()


async def test_open_blockers_lists_only_open_ones_for_this_project(
    db_session, make_workspace, make_user
):
    ws = await make_workspace()
    user = make_user()
    project = Project(
        workspace_id=ws.id, name="Alpha", identifier="ALP", cover_image_url="x"
    )
    db_session.add_all([user, project])
    await db_session.flush()

    open_blocker = WorkItemBlocker(
        project_id=project.id,
        story_id=str(uuid4()),
        reason="Waiting on vendor access",
        status=EBlockerStatus.OPEN,
    )
    resolved_blocker = WorkItemBlocker(
        project_id=project.id,
        story_id=str(uuid4()),
        reason="Already cleared",
        status=EBlockerStatus.RESOLVED,
    )
    db_session.add_all([open_blocker, resolved_blocker])
    await db_session.commit()

    tool = build_health_tools().get("list_open_blockers")
    assert tool is not None and tool.mutating is False

    result = await tool.handler(
        ToolContext(db=db_session, workspace=ws, user=user, role="owner", project_id=project.id), {}
    )
    assert result.is_error is False
    assert "Waiting on vendor access" in result.content
    assert "Already cleared" not in result.content


async def test_open_blockers_no_project_in_scope(db_session, make_workspace, make_user):
    ws = await make_workspace()
    user = make_user()
    db_session.add(user)
    await db_session.commit()

    tool = build_health_tools().get("list_open_blockers")
    assert tool is not None
    result = await tool.handler(
        ToolContext(db=db_session, workspace=ws, user=user, role="owner", project_id=None), {}
    )
    assert result.is_error is True


async def test_open_blockers_rejects_a_non_member_in_the_same_workspace(
    db_session, make_workspace, make_user
):
    ws = await make_workspace()
    user = make_user()
    project = Project(
        workspace_id=ws.id, name="Alpha", identifier="ALP", cover_image_url="x"
    )
    db_session.add_all([user, project])
    await db_session.flush()
    db_session.add(
        WorkItemBlocker(
            project_id=project.id,
            story_id=str(uuid4()),
            reason="Waiting on vendor access",
            status=EBlockerStatus.OPEN,
        )
    )
    await db_session.commit()

    tool = build_health_tools().get("list_open_blockers")
    assert tool is not None
    result = await tool.handler(
        ToolContext(db=db_session, workspace=ws, user=user, role="member", project_id=project.id),
        {},
    )
    assert result.is_error is True
    assert "Waiting on vendor access" not in result.content
