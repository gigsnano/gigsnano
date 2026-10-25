from gigsnano_api.agent.tools.base import ToolContext
from gigsnano_api.agent.tools.spend import build_spend_tools
from gigsnano_api.models import (
    ELlmUsageOperation,
    ELlmUsageSource,
    EMemberStatus,
    LlmUsageEvent,
    Project,
    ProjectMember,
    Story,
    TimeEntry,
)


async def test_spend_tools_are_read_only_and_scoped(db_session, make_workspace, make_user):
    ws = await make_workspace()
    user = make_user()
    db_session.add(user)
    await db_session.commit()
    ctx = ToolContext(db=db_session, workspace=ws, user=user, role="owner", project_id=None)

    registry = build_spend_tools()
    for name in ("time_logged_summary", "ai_spend_summary"):
        tool = registry.get(name)
        assert tool is not None, name
        assert tool.mutating is False, f"{name} must never mutate"

    # An empty workspace answers with zero, not an exception — "we have spent
    # nothing yet" is a real answer to a real question.
    result = await registry.get("ai_spend_summary").handler(ctx, {})
    assert result.is_error is False
    assert "0" in result.content

    result = await registry.get("time_logged_summary").handler(ctx, {})
    assert result.is_error is False
    assert "0 hours 0 minutes" in result.content


async def test_time_logged_sums_hours_for_the_project_in_scope(
    db_session, make_workspace, make_user
):
    ws = await make_workspace()
    user = make_user()
    project = Project(workspace_id=ws.id, name="Alpha", identifier="ALP", cover_image_url="x")
    db_session.add_all([user, project])
    await db_session.flush()

    story = Story(project_id=project.id, story_number=1, title="Do the thing")
    db_session.add(story)
    await db_session.flush()

    db_session.add_all(
        [
            TimeEntry(story_id=story.id, user_name="Ada", hours=1.5),
            TimeEntry(story_id=story.id, user_name="Ada", hours=2.0),
        ]
    )
    await db_session.commit()

    tool = build_spend_tools().get("time_logged_summary")
    result = await tool.handler(
        ToolContext(db=db_session, workspace=ws, user=user, role="owner", project_id=project.id),
        {},
    )
    assert result.is_error is False
    # 3.5 hours total = 3h 30m
    assert "3 hours 30 minutes" in result.content
    assert "this project" in result.content


async def test_ai_spend_sums_cost_for_the_workspace_when_no_project_in_scope(
    db_session, make_workspace, make_user
):
    ws = await make_workspace()
    user = make_user()
    db_session.add(user)
    await db_session.flush()

    db_session.add_all(
        [
            LlmUsageEvent(
                workspace_id=ws.id,
                user_id=user.id,
                source=ELlmUsageSource.GIGS_AI,
                operation=ELlmUsageOperation.STREAM_TURN,
                model="test-model",
                input_tokens=10,
                output_tokens=10,
                total_tokens=20,
                estimated_cost_usd="1.500000",
            ),
            LlmUsageEvent(
                workspace_id=ws.id,
                user_id=user.id,
                source=ELlmUsageSource.GIGS_AI,
                operation=ELlmUsageOperation.STREAM_TURN,
                model="test-model",
                input_tokens=10,
                output_tokens=10,
                total_tokens=20,
                estimated_cost_usd="0.500000",
            ),
        ]
    )
    await db_session.commit()

    tool = build_spend_tools().get("ai_spend_summary")
    result = await tool.handler(
        ToolContext(db=db_session, workspace=ws, user=user, role="owner", project_id=None), {}
    )
    assert result.is_error is False
    assert "2.00 USD" in result.content
    assert "the workspace" in result.content


async def test_time_logged_does_not_claim_the_whole_workspace_when_narrowed(
    db_session, make_workspace, make_user
):
    """A non-admin member who IS on one project (so `_scope` doesn't refuse them
    outright) but not others gets a total narrowed to `accessible_project_ids` —
    that is not "the workspace", and saying so tells them they're hearing a
    complete figure when it's partial."""
    ws = await make_workspace()
    user = make_user()
    my_project = Project(workspace_id=ws.id, name="Alpha", identifier="ALP", cover_image_url="x")
    other_project = Project(workspace_id=ws.id, name="Beta", identifier="BET", cover_image_url="x")
    db_session.add_all([user, my_project, other_project])
    await db_session.flush()

    db_session.add(
        ProjectMember(project_id=my_project.id, user_id=user.id, status=EMemberStatus.ACTIVE)
    )
    my_story = Story(project_id=my_project.id, story_number=1, title="Do the thing")
    other_story = Story(project_id=other_project.id, story_number=1, title="Someone else's")
    db_session.add_all([my_story, other_story])
    await db_session.flush()

    db_session.add_all(
        [
            TimeEntry(story_id=my_story.id, user_name="Ada", hours=1.0),
            TimeEntry(story_id=other_story.id, user_name="Bea", hours=5.0),
        ]
    )
    await db_session.commit()

    ctx = ToolContext(db=db_session, workspace=ws, user=user, role="member", project_id=None)
    tool = build_spend_tools().get("time_logged_summary")
    result = await tool.handler(ctx, {})

    assert result.is_error is False
    # Only the accessible project's hour is counted, not the other project's 5.
    assert "1 hours 0 minutes" in result.content
    assert "the workspace" not in result.content
    assert "your accessible projects" in result.content


async def test_time_logged_rejects_a_project_from_another_workspace(
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

    tool = build_spend_tools().get("time_logged_summary")
    result = await tool.handler(
        ToolContext(
            db=db_session, workspace=ws, user=user, role="owner", project_id=other_project.id
        ),
        {},
    )
    assert result.is_error is True
    assert "project" in result.content.lower()


async def test_spend_tools_reject_a_non_member_in_the_same_workspace(
    db_session, make_workspace, make_user
):
    """A plain workspace member with no ProjectMember row on THIS project must be
    refused exactly like 'no project in scope' — the same rule get_project_or_404
    enforces over HTTP. This user IS a workspace member of `ws` (that's what
    role="member" simulates) but has no ProjectMember row on `project`, so a
    naive workspace-only scope would wrongly let them read it; only the
    membership check (accessible_project_ids) catches this."""
    ws = await make_workspace()
    user = make_user()
    project = Project(workspace_id=ws.id, name="Alpha", identifier="ALP", cover_image_url="x")
    db_session.add_all([user, project])
    await db_session.flush()

    story = Story(project_id=project.id, story_number=1, title="Do the thing")
    db_session.add(story)
    await db_session.flush()
    db_session.add(TimeEntry(story_id=story.id, user_name="Ada", hours=5.0))
    db_session.add(
        LlmUsageEvent(
            workspace_id=ws.id,
            project_id=project.id,
            user_id=user.id,
            source=ELlmUsageSource.GIGS_AI,
            operation=ELlmUsageOperation.STREAM_TURN,
            model="test-model",
            input_tokens=10,
            output_tokens=10,
            total_tokens=20,
            estimated_cost_usd="9.000000",
        )
    )
    await db_session.commit()

    ctx = ToolContext(db=db_session, workspace=ws, user=user, role="member", project_id=project.id)
    registry = build_spend_tools()

    time_result = await registry.get("time_logged_summary").handler(ctx, {})
    assert time_result.is_error is True
    assert "5 hours" not in time_result.content

    spend_result = await registry.get("ai_spend_summary").handler(ctx, {})
    assert spend_result.is_error is True
    assert "9.00" not in spend_result.content


async def test_workspace_wide_totals_are_not_readable_by_a_non_project_member(
    db_session, make_workspace, make_user
):
    """I3. With no project in scope both tools used to fall through UNSCOPED to
    the whole workspace, so a member with zero project memberships -- or a
    Viewer -- could ask a microphone for the org's total hours and AI spend.
    `accessible_project_ids` is the gate the HTTP sibling over the same rows
    (`features/time_tracking/router.py::workspace_time_entries`) already applies.
    The refusal is the identical "no project in scope" copy an out-of-scope
    project gets -- a distinct message would confirm the numbers exist."""
    ws = await make_workspace()
    user = make_user()
    project = Project(workspace_id=ws.id, name="Alpha", identifier="ALP", cover_image_url="x")
    db_session.add_all([user, project])
    await db_session.flush()

    story = Story(project_id=project.id, story_number=1, title="Do the thing")
    db_session.add(story)
    await db_session.flush()
    db_session.add(TimeEntry(story_id=story.id, user_name="Ada", hours=5.0))
    db_session.add(
        LlmUsageEvent(
            workspace_id=ws.id,
            project_id=project.id,
            user_id=user.id,
            source=ELlmUsageSource.GIGS_AI,
            operation=ELlmUsageOperation.STREAM_TURN,
            model="test-model",
            input_tokens=10,
            output_tokens=10,
            total_tokens=20,
            estimated_cost_usd="9.000000",
        )
    )
    await db_session.commit()

    # No project asked for at all -- the workspace-wide question.
    ctx = ToolContext(db=db_session, workspace=ws, user=user, role="member", project_id=None)
    registry = build_spend_tools()

    time_result = await registry.get("time_logged_summary").handler(ctx, {})
    assert time_result.is_error is True
    assert "5 hours" not in time_result.content

    spend_result = await registry.get("ai_spend_summary").handler(ctx, {})
    assert spend_result.is_error is True
    assert "9.00" not in spend_result.content
    # Indistinguishable from an out-of-scope project, by construction.
    assert time_result.content == spend_result.content
