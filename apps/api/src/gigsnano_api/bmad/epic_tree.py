"""BMAD epics finalize: create Epic→Story→Task rows in the stories table."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.lib.story_numbers import next_story_number
from gigsnano_api.models import Cycle, EStoryPriority, EStoryType, Project, Story


class SprintZeroCycleMissing(Exception):
    """Project has no Sprint-0 cycle — cannot place generated work items."""


async def _sprint_zero_cycle_id(db: AsyncSession, project_id: str) -> str:
    row = (
        await db.execute(
            select(Cycle.id)
            .where(Cycle.project_id == project_id, Cycle.is_sprint_zero.is_(True))
            .limit(1)
        )
    ).scalar_one_or_none()
    if row is None:
        raise SprintZeroCycleMissing(project_id)
    return row


async def _next_sort_order(db: AsyncSession, project_id: str) -> int:
    max_order = (
        await db.execute(
            select(func.coalesce(func.max(Story.sort_order), -1)).where(
                Story.project_id == project_id
            )
        )
    ).scalar_one()
    return max_order + 1




async def create_epic_tree(
    db: AsyncSession, project: Project, data: dict
) -> None:
    """Insert a 3-level tree from validated epics extraction data."""
    cycle_id = await _sprint_zero_cycle_id(db, project.id)
    order = await _next_sort_order(db, project.id)
    number = await next_story_number(db, project.id)

    for epic_in in data["epics"]:
        epic_story = Story(
            project_id=project.id,
            cycle_id=cycle_id,
            type=EStoryType.EPIC,
            parent_id=None,
            title=epic_in["title"],
            description=epic_in.get("description", ""),
            sort_order=order,
            story_number=number,
        )
        db.add(epic_story)
        await db.flush()
        order += 1
        number += 1

        for story_in in epic_in["stories"]:
            story_row = Story(
                project_id=project.id,
                cycle_id=cycle_id,
                type=EStoryType.STORY,
                parent_id=epic_story.id,
                title=story_in["title"],
                description=story_in.get("description", ""),
                priority=EStoryPriority(story_in.get("priority", "none")),
                sort_order=order,
                story_number=number,
            )
            db.add(story_row)
            await db.flush()
            order += 1
            number += 1

            for task_in in story_in.get("tasks", []):
                db.add(
                    Story(
                        project_id=project.id,
                        cycle_id=cycle_id,
                        type=EStoryType.TASK,
                        parent_id=story_row.id,
                        title=task_in["title"],
                        description=task_in.get("description", ""),
                        sort_order=order,
                        story_number=number,
                    )
                )
                order += 1
                number += 1
