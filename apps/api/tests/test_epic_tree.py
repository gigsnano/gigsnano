import pytest
from sqlalchemy import select

from gigsnano_api.bmad.epic_tree import SprintZeroCycleMissing, create_epic_tree
from gigsnano_api.models import Cycle, EStoryType, Project, Story, Workspace


async def _seed_project(db_session):
    ws = Workspace(slug="acme", name="Acme")
    db_session.add(ws)
    await db_session.flush()
    project = Project(workspace_id=ws.id, name="App", identifier="APP",
                      cover_image_url="https://img.test/c.jpg")
    db_session.add(project)
    await db_session.flush()
    db_session.add(Cycle(project_id=project.id, name="Sprint 0", is_sprint_zero=True))
    await db_session.flush()
    return project


async def test_create_epic_tree_three_levels(db_session):
    project = await _seed_project(db_session)
    await create_epic_tree(db_session, project, {
        "epics": [{
            "title": "Core",
            "description": "Foundation",
            "stories": [{
                "title": "Login",
                "description": "AC",
                "priority": "high",
                "tasks": [{"title": "Form", "description": ""}],
            }],
        }],
    })
    await db_session.commit()

    rows = (
        await db_session.execute(
            select(Story).where(Story.project_id == project.id).order_by(Story.sort_order)
        )
    ).scalars().all()
    assert len(rows) == 3
    epic, story, task = rows
    assert epic.type == EStoryType.EPIC
    assert epic.parent_id is None
    assert story.type == EStoryType.STORY
    assert story.parent_id == epic.id
    assert story.priority.value == "high"
    assert task.type == EStoryType.TASK
    assert task.parent_id == story.id
    assert epic.cycle_id == story.cycle_id == task.cycle_id


async def test_create_epic_tree_requires_sprint_zero(db_session):
    ws = Workspace(slug="solo", name="Solo")
    db_session.add(ws)
    await db_session.flush()
    project = Project(workspace_id=ws.id, name="Lonely", identifier="LON",
                      cover_image_url="https://img.test/c.jpg")
    db_session.add(project)
    await db_session.flush()

    with pytest.raises(SprintZeroCycleMissing):
        await create_epic_tree(db_session, project, {
            "epics": [{"title": "E", "description": "", "stories": [
                {"title": "S", "description": "", "priority": "none"},
            ]}],
        })
