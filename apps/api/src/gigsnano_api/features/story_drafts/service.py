from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.models import StoryDraft


async def list_my_drafts(db: AsyncSession, workspace_id: str, user_id: str) -> list[StoryDraft]:
    rows = await db.execute(
        select(StoryDraft)
        .where(StoryDraft.workspace_id == workspace_id, StoryDraft.created_by_id == user_id)
        .order_by(StoryDraft.updated_at.desc())
    )
    return list(rows.scalars().all())


async def get_my_draft(db: AsyncSession, draft_id: str, user_id: str) -> StoryDraft | None:
    draft = await db.get(StoryDraft, draft_id)
    if draft is None or draft.created_by_id != user_id:
        return None
    return draft


async def create_draft(
    db: AsyncSession, *, workspace_id: str, project_id: str, user_id: str,
    title: str, payload: dict,
) -> StoryDraft:
    draft = StoryDraft(
        workspace_id=workspace_id, project_id=project_id, created_by_id=user_id,
        title=title[:300], payload=payload,
    )
    db.add(draft)
    await db.flush()
    return draft
