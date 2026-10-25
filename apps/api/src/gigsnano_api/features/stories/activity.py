"""Story activity-feed helper (mirrors domain.projects.record_activity). Writes one
StoryActivity row; the caller owns the commit so the activity lands in the same
transaction as the change that produced it."""

from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.models import User
from gigsnano_api.models import (
    EStoryActivityField,
    EStoryActivityKind,
    StoryActivity,
)


def record_story_activity(
    db: AsyncSession,
    story_id: str,
    actor: User | None,
    *,
    kind: EStoryActivityKind,
    field: EStoryActivityField | None,
    summary: str,
    old_value: str | None = None,
    new_value: str | None = None,
) -> None:
    db.add(
        StoryActivity(
            story_id=story_id,
            kind=kind,
            field=field,
            actor_id=actor.id if actor else None,
            actor_name=actor.display_name if actor else "System",
            summary=summary,
            old_value=old_value,
            new_value=new_value,
        )
    )
