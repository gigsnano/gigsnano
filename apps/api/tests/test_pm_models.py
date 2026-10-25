import pytest
from sqlalchemy.exc import IntegrityError

from gigsnano_api.auth.models import User
from gigsnano_api.models import (
    Cycle,
    ECycleStatus,
    EProjectFlow,
    EProjectRole,
    EStoryPriority,
    EStoryStatus,
    Project,
    ProjectMember,
    Story,
    Workspace,
)


async def seed_project(db_session) -> Project:
    user = User(email="ada@example.test", display_name="Ada Lovelace", password_hash="x")
    ws = Workspace(slug="acme", name="Acme")
    db_session.add_all([user, ws])
    await db_session.flush()
    project = Project(
        workspace_id=ws.id, name="Mobile App", identifier="MBA",
        cover_image_url="https://img.test/c.jpg", lead_id=user.id,
    )
    db_session.add(project)
    await db_session.flush()
    return project


async def test_project_defaults(db_session):
    project = await seed_project(db_session)
    await db_session.commit()
    assert project.flow == EProjectFlow.FRESH
    assert project.has_ui is True
    assert project.description == ""
    assert project.overview == ""
    assert project.start_date is not None  # defaulted


async def test_story_defaults_and_bmad_columns(db_session):
    project = await seed_project(db_session)
    cycle = Cycle(project_id=project.id, name="Sprint 0", is_sprint_zero=True,
                  status=ECycleStatus.ACTIVE)
    db_session.add(cycle)
    await db_session.flush()
    story = Story(project_id=project.id, cycle_id=cycle.id, title="Create the PRD",
                  sort_order=4, bmad_workflow="bmad-prd",
                  bmad_agent="Product Manager · John", bmad_artifact="prd.md",
                  bmad_is_required=True)
    db_session.add(story)
    await db_session.commit()
    assert story.status == EStoryStatus.TODO
    assert story.priority == EStoryPriority.NONE
    assert story.bmad_is_locked is True
    assert story.bmad_skipped is False
    assert story.bmad_readiness_result is None


async def test_project_member_unique(db_session):
    project = await seed_project(db_session)
    db_session.add(ProjectMember(project_id=project.id, user_id=project.lead_id,
                                 role=EProjectRole.ADMIN))
    await db_session.commit()
    db_session.add(ProjectMember(project_id=project.id, user_id=project.lead_id))
    with pytest.raises(IntegrityError):
        await db_session.commit()
