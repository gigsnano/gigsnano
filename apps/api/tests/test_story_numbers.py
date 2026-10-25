"""The soft-delete trap that once 409'd every create in a project."""

from gigsnano_api.lib.story_numbers import next_story_number
from gigsnano_api.models.stories import EStoryStatus, Story


async def _story(db_session, project, number: int) -> Story:
    story = Story(
        project_id=project.id, title=f"Item {number}",
        status=EStoryStatus.TODO, story_number=number,
    )
    db_session.add(story)
    await db_session.flush()
    return story


async def test_first_number_is_one(db_session, make_project):
    project = await make_project()
    assert await next_story_number(db_session, project.id) == 1


async def test_counts_past_a_soft_deleted_row(db_session, make_project):
    project = await make_project()
    await _story(db_session, project, 1)
    newest = await _story(db_session, project, 2)

    newest.deleted_at = __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
    await db_session.flush()

    # 3, not 2: the trashed row still holds 2 under the unique constraint.
    assert await next_story_number(db_session, project.id) == 3


async def test_counters_do_not_hand_out_the_same_number_twice(db_session, make_project):
    project = await make_project()
    await _story(db_session, project, 1)
    counters: dict[str, int] = {}
    allocated = [await next_story_number(db_session, project.id, counters) for _ in range(3)]
    assert allocated == [2, 3, 4]
