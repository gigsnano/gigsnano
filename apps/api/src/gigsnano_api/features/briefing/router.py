from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import get_db, utcnow
from gigsnano_api.features.briefing.schemas import BriefingOut
from gigsnano_api.features.briefing.service import build_briefing, resolve_since
from gigsnano_api.shared.context import WorkspaceContext, get_workspace_context

router = APIRouter(tags=["briefing"])


@router.get("/workspaces/{workspace_slug}/briefing/", response_model=BriefingOut)
async def get_briefing(
    since: datetime | None = Query(None),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    now = utcnow()
    return await build_briefing(db, ctx, since=resolve_since(since, now), now=now)
