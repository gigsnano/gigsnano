"""Entitlements read surface (GIN-234/236): the workspace's per-capability
available/quota/used, so the FE renders locked/available + usage meters."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.billing.metering import entitlement_summary
from gigsnano_api.core.db import get_db
from gigsnano_api.shared.context import WorkspaceContext, get_workspace_context

router = APIRouter(tags=["entitlements"])


@router.get("/workspaces/{workspace_slug}/entitlements/")
async def list_entitlements(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    return await entitlement_summary(db, ctx.workspace.id)
