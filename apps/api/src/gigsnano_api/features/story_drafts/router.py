from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import get_db
from gigsnano_api.features.story_drafts import service as DS
from gigsnano_api.features.story_drafts.schemas import StoryDraftOut, StoryDraftUpsert
from gigsnano_api.models import Project, StoryDraft
from gigsnano_api.shared.context import (
    WorkspaceContext,
    get_workspace_context,
    require_project_write_access,
)

router = APIRouter(tags=["drafts"])


def _out(d: StoryDraft, slug: str) -> StoryDraftOut:
    return StoryDraftOut(
        id=d.id, workspace_slug=slug, project_id=d.project_id,
        title=d.title, payload=d.payload, created_at=d.created_at, updated_at=d.updated_at,
    )


async def _own_draft_or_404(db, draft_id, ctx) -> StoryDraft:
    draft = await DS.get_my_draft(db, draft_id, ctx.user.id)
    if draft is None or draft.workspace_id != ctx.workspace.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Draft not found")
    return draft


@router.get("/workspaces/{workspace_slug}/drafts/", response_model=list[StoryDraftOut])
async def list_drafts(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    drafts = await DS.list_my_drafts(db, ctx.workspace.id, ctx.user.id)
    return [_out(d, ctx.workspace.slug) for d in drafts]


@router.post(
    "/workspaces/{workspace_slug}/projects/{project_id}/drafts/",
    response_model=StoryDraftOut, status_code=status.HTTP_201_CREATED,
)
async def create_draft(
    payload: StoryDraftUpsert,
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    draft = await DS.create_draft(
        db, workspace_id=ctx.workspace.id, project_id=project.id,
        user_id=ctx.user.id, title=payload.title, payload=payload.payload,
    )
    await db.commit()
    return _out(draft, ctx.workspace.slug)


@router.patch("/workspaces/{workspace_slug}/drafts/{draft_id}/", response_model=StoryDraftOut)
async def update_draft(
    draft_id: str, payload: StoryDraftUpsert,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    draft = await _own_draft_or_404(db, draft_id, ctx)
    draft.title = payload.title[:300]
    draft.payload = payload.payload
    await db.commit()
    return _out(draft, ctx.workspace.slug)


@router.delete("/workspaces/{workspace_slug}/drafts/{draft_id}/")
async def delete_draft(
    draft_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    draft = await _own_draft_or_404(db, draft_id, ctx)
    await db.delete(draft)
    await db.commit()
    return {"success": True}
