"""Read-only delivery-metrics endpoint (GIN-333). Project-scoped via
get_project_or_404 (Owner/Admin governance + project membership), so it can't
leak another project's history."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import get_db
from gigsnano_api.models import Project
from gigsnano_api.shared.context import (
    WorkspaceContext,
    get_project_or_404,
    get_workspace_context,
)

from .alerts import emit_material_change_alerts
from .schemas import CalibrationOut, DeliveryMetricsOut, ForecastOut, HealthOut, SnapshotOut
from .service import compute_delivery_metrics, compute_forecast, compute_health
from .snapshots import compute_calibration, record_forecast_snapshot, snapshot_out

router = APIRouter(tags=["forecasting"])


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/forecasting/delivery-metrics/",
    response_model=DeliveryMetricsOut,
)
async def get_delivery_metrics(
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
    period_days: int = 7,
    periods: int = 12,
) -> DeliveryMetricsOut:
    period_days = max(1, min(period_days, 90))
    periods = max(1, min(periods, 52))
    return await compute_delivery_metrics(
        db, project, now=datetime.now(timezone.utc), period_days=period_days, periods=periods
    )


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/forecasting/completion/",
    response_model=ForecastOut,
)
async def get_completion_forecast(
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
    period_days: int = 7,
    window_periods: int = 12,
) -> ForecastOut:
    period_days = max(1, min(period_days, 90))
    window_periods = max(1, min(window_periods, 52))
    return await compute_forecast(
        db,
        project,
        now=datetime.now(timezone.utc),
        period_days=period_days,
        window_periods=window_periods,
    )


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/forecasting/health/",
    response_model=HealthOut,
)
async def get_project_health(
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
) -> HealthOut:
    return await compute_health(db, project, now=datetime.now(timezone.utc))


@router.post(
    "/workspaces/{workspace_slug}/projects/{project_id}/forecasting/recalc/",
    response_model=SnapshotOut,
)
async def recalc_forecast(
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> SnapshotOut:
    """Recompute the forecast and append it to the history (GIN-335 s2). Idempotent:
    an unchanged result is not re-stored. On a new snapshot, alert project members
    if health changed materially vs the prior snapshot (GIN-339). The event/schedule
    hook for accruing forecast history."""
    snap, created = await record_forecast_snapshot(db, project, now=datetime.now(timezone.utc))
    if created:
        await emit_material_change_alerts(
            db,
            project,
            workspace_id=ctx.workspace.id,
            slug=ctx.workspace.slug,
            triggered_by_id=ctx.user.id,
        )
    await db.commit()
    return snapshot_out(snap, created)


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/forecasting/calibration/",
    response_model=CalibrationOut,
)
async def get_calibration(
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
) -> CalibrationOut:
    """Calibration of retained forecasts vs actual outcomes, per algorithm version
    (GIN-335 s2)."""
    return await compute_calibration(db, project, now=datetime.now(timezone.utc))
