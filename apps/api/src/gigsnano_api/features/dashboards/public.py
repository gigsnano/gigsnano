"""Anonymous read-only access to a published dashboard (GIN-489).

Every route here is unauthenticated, so the rules are stricter than anywhere
else in the API:

* The token is the only credential. It resolves a single dashboard and nothing
  else; an unknown, revoked or rotated token is an indistinguishable 404.
* Data is scoped to what the *publisher* can see, by rebuilding their workspace
  context and reusing the same aggregations the authenticated endpoints run.
  A visitor can therefore never see more than the person who published.
* Responses carry no workspace, project, cycle or user identifiers, and no
  per-person breakdowns — only the aggregate numbers the eligible widgets draw.
* Filters (which project a widget is scoped to) stay server-side: the client
  identifies a widget by id and the stored settings are applied here, so a
  visitor can neither read them nor widen them.
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import get_db
from gigsnano_api.features.analytics.router import get_analytics
from gigsnano_api.features.analytics.schemas import WorkspaceAnalyticsOut
from gigsnano_api.features.dashboards.public_widgets import (
    PUBLIC_ELIGIBLE_WIDGET_TYPES,
    PUBLIC_SAFE_SETTING_KEYS,
    public_widgets,
)
from gigsnano_api.features.dashboards.router import (
    dashboard_activity,
    dashboard_metrics,
    dashboard_planned_workload,
)
from gigsnano_api.features.dashboards.schemas import (
    DashboardActivityOut,
    DashboardMetricsOut,
    EChartBucket,
    LabelCountOut,
    PlannedWorkloadOut,
    PublicDashboardFiltersOut,
    PublicDashboardOut,
    PublicWidgetOut,
)
from gigsnano_api.models import Dashboard, EMemberStatus, User, Workspace, WorkspaceMember
from gigsnano_api.shared.context import WorkspaceContext

router = APIRouter(tags=["public-dashboards"])

_P = "/public/dashboards/{token}"

# One message for every failure mode — unknown token, rotated token, unpublished
# dashboard, publisher removed from the workspace. Distinguishing them would
# confirm that a given link once existed.
_UNAVAILABLE = "This dashboard is unavailable"


async def _published(db: AsyncSession, token: str) -> Dashboard:
    row = (
        await db.execute(select(Dashboard).where(Dashboard.public_token == token))
    ).scalar_one_or_none()
    if row is None or row.visibility != "public":
        raise HTTPException(status.HTTP_404_NOT_FOUND, _UNAVAILABLE)
    return row


async def _publisher_context(db: AsyncSession, dashboard: Dashboard) -> WorkspaceContext:
    """The owner's workspace scope, so public data matches what they can see.

    If the owner has since lost access (membership removed or deactivated), the
    dashboard stops resolving rather than falling back to a wider scope.
    """
    workspace = await db.get(Workspace, dashboard.workspace_id)
    user = await db.get(User, dashboard.owner_id)
    if workspace is None or user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, _UNAVAILABLE)
    member = (
        await db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace.id,
                WorkspaceMember.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if member is None or member.status != EMemberStatus.ACTIVE:
        raise HTTPException(status.HTTP_404_NOT_FOUND, _UNAVAILABLE)
    return WorkspaceContext(
        user=user, workspace=workspace, role=member.role, status=member.status
    )


def _widget_or_404(dashboard: Dashboard, widget_id: str) -> dict:
    """The stored widget, if it is one a visitor is allowed to see at all."""
    for widget in public_widgets(dashboard.config):
        if widget.get("id") == widget_id:
            return widget
    raise HTTPException(status.HTTP_404_NOT_FOUND, _UNAVAILABLE)


def _stored_project_ids(dashboard: Dashboard) -> str | None:
    """The board's dashboard-wide project filter, as the endpoints' comma list.

    Applied server-side and never sent to the page: project ids are exactly
    what a public payload must not carry.
    """
    ids = ((dashboard.config or {}).get("filters") or {}).get("project_ids") or []
    return ",".join(str(i) for i in ids) or None


def _public_filters(dashboard: Dashboard) -> PublicDashboardFiltersOut:
    """The board's date window — the only part of its filter the page needs."""
    stored = (dashboard.config or {}).get("filters") or {}

    def pick(key: str) -> str | None:
        value = stored.get(key)
        return value if isinstance(value, str) else None

    return PublicDashboardFiltersOut(
        date_range=pick("date_range"), date_from=pick("date_from"), date_to=pick("date_to")
    )


def _safe_settings(widget: dict) -> dict:
    settings = widget.get("settings") or {}
    return {k: v for k, v in settings.items() if k in PUBLIC_SAFE_SETTING_KEYS}


@router.get(f"{_P}/", response_model=PublicDashboardOut)
async def get_public_dashboard(token: str, db: AsyncSession = Depends(get_db)):
    dashboard = await _published(db, token)
    await _publisher_context(db, dashboard)  # 404s if the publisher lost access
    return PublicDashboardOut(
        name=dashboard.name,
        description=dashboard.description,
        updated_at=dashboard.updated_at,
        filters=_public_filters(dashboard),
        widgets=[
            PublicWidgetOut(
                id=str(w.get("id")),
                type=str(w.get("type")),
                title=str(w.get("title") or ""),
                x=int(w.get("x") or 0),
                y=int(w.get("y") or 0),
                w=int(w.get("w") or 4),
                h=int(w.get("h") or 3),
                settings=_safe_settings(w),
            )
            for w in public_widgets(dashboard.config)
        ],
    )


@router.get(f"{_P}/widgets/{{widget_id}}/metrics/", response_model=DashboardMetricsOut)
async def public_widget_metrics(
    token: str,
    widget_id: str,
    date_from: date | None = None,
    date_to: date | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Aggregate counts for one public widget.

    Only the date window comes from the caller — every identity filter is read
    from the widget's stored settings. The per-assignee breakdowns the
    authenticated payload carries are dropped, and label ids are replaced with
    positions, so nothing here identifies a person or an internal record.
    """
    dashboard = await _published(db, token)
    ctx = await _publisher_context(db, dashboard)
    settings = _widget_or_404(dashboard, widget_id).get("settings") or {}

    metrics = await dashboard_metrics(
        project_id=settings.get("project_id"),
        project_ids=_stored_project_ids(dashboard),
        assignee_id=settings.get("assignee_id"),
        priority=settings.get("priority"),
        status=settings.get("status"),
        date_from=date_from,
        date_to=date_to,
        ctx=ctx,
        db=db,
    )
    return DashboardMetricsOut(
        total=metrics.total,
        open=metrics.open,
        status_counts=metrics.status_counts,
        priority_counts=metrics.priority_counts,
        assignee_counts={},
        assignee_status_counts={},
        label_counts=[
            LabelCountOut(id=str(i), name=row.name, color=row.color, count=row.count)
            for i, row in enumerate(metrics.label_counts)
        ],
    )


@router.get(f"{_P}/widgets/{{widget_id}}/activity/", response_model=DashboardActivityOut)
async def public_widget_activity(
    token: str,
    widget_id: str,
    date_from: date | None = None,
    date_to: date | None = None,
    bucket: EChartBucket = EChartBucket.DAY,
    db: AsyncSession = Depends(get_db),
):
    """Per-period work-item activity for one public widget. Counts only — the
    payload has no ids to strip."""
    dashboard = await _published(db, token)
    ctx = await _publisher_context(db, dashboard)
    settings = _widget_or_404(dashboard, widget_id).get("settings") or {}
    return await dashboard_activity(
        project_id=settings.get("project_id"),
        project_ids=_stored_project_ids(dashboard),
        date_from=date_from,
        date_to=date_to,
        bucket=bucket,
        ctx=ctx,
        db=db,
    )


@router.get(f"{_P}/widgets/{{widget_id}}/planned/", response_model=PlannedWorkloadOut)
async def public_widget_planned(
    token: str,
    widget_id: str,
    date_from: date | None = None,
    date_to: date | None = None,
    bucket: EChartBucket = EChartBucket.DAY,
    db: AsyncSession = Depends(get_db),
):
    """Per-period scheduled workload for one public widget. Counts only."""
    dashboard = await _published(db, token)
    ctx = await _publisher_context(db, dashboard)
    settings = _widget_or_404(dashboard, widget_id).get("settings") or {}
    return await dashboard_planned_workload(
        project_id=settings.get("project_id"),
        project_ids=_stored_project_ids(dashboard),
        date_from=date_from,
        date_to=date_to,
        bucket=bucket,
        ctx=ctx,
        db=db,
    )


@router.get(f"{_P}/analytics/", response_model=WorkspaceAnalyticsOut)
async def public_analytics(token: str, db: AsyncSession = Depends(get_db)):
    """Workspace roll-up behind the sprint/velocity/KPI widgets, with every id
    blanked — names are what those widgets draw, ids would only leak the tenant.

    Served whenever the board carries at least one widget that reads it, rather
    than per widget: it takes no per-widget settings.
    """
    dashboard = await _published(db, token)
    if not any(
        w.get("type") in {"sprint_status", "velocity", "kpi"}
        for w in public_widgets(dashboard.config)
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, _UNAVAILABLE)
    ctx = await _publisher_context(db, dashboard)

    analytics = await get_analytics(
        project_ids=_stored_project_ids(dashboard), ctx=ctx, db=db
    )
    for row in analytics.project_progress:
        row.project_id = ""
    for row in analytics.active_cycle_details:
        row.cycle_id = ""
        row.project_id = ""
    analytics.workspace_slug = ""
    return analytics


__all__ = ["PUBLIC_ELIGIBLE_WIDGET_TYPES", "router"]
