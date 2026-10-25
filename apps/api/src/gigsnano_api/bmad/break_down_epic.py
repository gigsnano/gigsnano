"""Break an existing epic into Story→Task children (Option C persist layer)."""

from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.lib.story_numbers import next_story_number
from gigsnano_api.models import EStoryPriority, EStoryType, Story


class EpicAlreadyBrokenDown(Exception):
    def __init__(self, epic_id: str) -> None:
        self.epic_id = epic_id
        super().__init__(f"Epic {epic_id} already has sub-work items")


@dataclass(frozen=True)
class BreakDownResult:
    stories: int
    tasks: int


async def _next_sort_order(db: AsyncSession, project_id: str) -> int:
    max_order = (
        await db.execute(
            select(func.coalesce(func.max(Story.sort_order), -1)).where(
                Story.project_id == project_id
            )
        )
    ).scalar_one()
    return max_order + 1




async def _child_count(db: AsyncSession, epic_id: str) -> int:
    return int(
        (
            await db.execute(
                select(func.count()).where(Story.parent_id == epic_id)
            )
        ).scalar_one()
    )


async def break_down_epic(db: AsyncSession, epic: Story, data: dict) -> BreakDownResult:
    if epic.type != EStoryType.EPIC:
        raise ValueError("break_down_epic requires type=epic")
    if await _child_count(db, epic.id) > 0:
        raise EpicAlreadyBrokenDown(epic.id)

    order = await _next_sort_order(db, epic.project_id)
    number = await next_story_number(db, epic.project_id)
    created_stories = 0
    created_tasks = 0

    for story_in in data["stories"]:
        story_row = Story(
            project_id=epic.project_id,
            cycle_id=epic.cycle_id,
            type=EStoryType.STORY,
            parent_id=epic.id,
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
        created_stories += 1

        for task_in in story_in.get("tasks", []):
            db.add(
                Story(
                    project_id=epic.project_id,
                    cycle_id=epic.cycle_id,
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
            created_tasks += 1

    return BreakDownResult(stories=created_stories, tasks=created_tasks)
