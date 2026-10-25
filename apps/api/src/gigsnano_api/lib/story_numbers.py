"""Allocate a project's next work-item number.

Extracted because there were four copies of this query and a fifth was about to
be written. They must all pass `include_deleted=True`: a trashed row keeps its
number under the `(project_id, story_number)` unique constraint, so a `max()`
that respects the soft-delete filter hands back a number that is already taken —
which is how trashing a project's newest item once made every later create 409
forever.

Pure query helper: no commit, no flush.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.models.stories import Story


async def next_story_number(
    db: AsyncSession, project_id: str, counters: dict[str, int] | None = None
) -> int:
    """The next free number for `project_id`.

    Pass `counters` when allocating many in one transaction: the rows are not
    flushed between calls, so a fresh `max()` would return the same number twice.
    """
    if counters is not None and project_id in counters:
        counters[project_id] += 1
        return counters[project_id]

    current_max = (
        await db.execute(
            select(func.coalesce(func.max(Story.story_number), 0))
            .where(Story.project_id == project_id)
            # Trashed rows keep their number under the unique constraint.
            .execution_options(include_deleted=True)
        )
    ).scalar_one()

    if counters is not None:
        counters[project_id] = current_max + 1
        return counters[project_id]
    return current_max + 1
