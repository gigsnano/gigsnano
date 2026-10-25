from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import get_db
from gigsnano_api.features.inbox.schemas import InboxOut
from gigsnano_api.features.inbox.service import build_inbox
from gigsnano_api.shared.context import WorkspaceContext, get_workspace_context

router = APIRouter(tags=["inbox"])


@router.get("/workspaces/{workspace_slug}/inbox/", response_model=InboxOut)
async def get_inbox(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    return await build_inbox(db, ctx)
