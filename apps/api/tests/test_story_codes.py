import pytest
from sqlalchemy.exc import IntegrityError

from gigsnano_api.models import Story
from tests.test_stories import setup_project


async def _create_story(client, project_id, title):
    return await client.post(
        f"/api/workspaces/acme/projects/{project_id}/stories/",
        json={"title": title},
    )


async def test_story_gets_sequential_code(client):
    project = await setup_project(client)  # identifier "MBA"
    first = (await _create_story(client, project["id"], "One")).json()
    second = (await _create_story(client, project["id"], "Two")).json()
    assert first["code"] == f"MBA-{first['story_number']}"
    assert second["story_number"] == first["story_number"] + 1


async def test_duplicate_story_number_rejected_at_db_level(db_session, make_project):
    """The (project_id, story_number) unique constraint must be enforced by the
    model itself (not just the migration) — the test schema is built from
    Base.metadata.create_all, so this only passes if Story.__table_args__ carries
    the constraint."""
    project = await make_project()
    db_session.add(
        Story(project_id=project.id, title="First", story_number=1)
    )
    await db_session.flush()

    db_session.add(
        Story(project_id=project.id, title="Second", story_number=1)
    )
    with pytest.raises(IntegrityError):
        await db_session.flush()
