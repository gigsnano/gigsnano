
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import get_db, utcnow
from gigsnano_api.features.reports.schemas import ReportsOut, TReportRange
from gigsnano_api.features.reports.service import build_reports
from gigsnano_api.shared.context import WorkspaceContext, get_workspace_context

router = APIRouter(tags=["reports"])


@router.get("/workspaces/{workspace_slug}/reports/", response_model=ReportsOut)
async def get_reports(
    range: TReportRange = Query("7d"),
    project_ids: str | None = Query(None),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    return await build_reports(db, ctx, range, project_ids, utcnow().date())
