"""Workspace-scoped, money-first AI usage read endpoints.

Aggregates the existing `LlmUsageEvent` ledger into the shape the frontend
`IWorkspaceUsageSummary` / `IThreadUsage` (src/types/billing/ai-cost.ts) expects.
Cost is stored as USD Numeric(12,6); the UI wants cents (usd * 100).
`delta_cost_pct` is a FRACTION (the UI multiplies by 100).
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.models import User
from gigsnano_api.core.db import get_db
from gigsnano_api.models import ELlmUsageSource, LlmUsageEvent, Project
from gigsnano_api.shared.context import WorkspaceContext, get_workspace_context

router = APIRouter(tags=["billing"])

_WINDOW_DAYS = 30
_AGENT_LABELS = {
    ELlmUsageSource.BMAD_STORY.value: "BMAD Agents",
    ELlmUsageSource.GIGS_AI.value: "GigsAI",
}


class Period(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    from_: str = Field(alias="from")
    to: str


class BreakdownEntryOut(BaseModel):
    id: str
    name: str
    cost_cents: float
    event_count: int


class TimeseriesPointOut(BaseModel):
    date: str
    cost_cents: float


class PriorPeriodOut(BaseModel):
    total_cost_cents: float
    delta_cost_pct: float | None


class WorkspaceUsageSummaryOut(BaseModel):
    period: Period
    total_cost_cents: float
    event_count: int
    by_project: list[BreakdownEntryOut]
    by_agent: list[BreakdownEntryOut]
    by_member: list[BreakdownEntryOut]
    timeseries: list[TimeseriesPointOut]
    prior_period: PriorPeriodOut


class UsageLineOut(BaseModel):
    id: str
    source: str
    operation: str
    model: str
    input_tokens: int
    output_tokens: int
    cost_cents: float
    project_id: str | None
    story_id: str | None
    thread_id: str | None
    created_at: str


class ThreadUsageOut(BaseModel):
    thread_id: str
    total_cost_cents: float
    message_count: int
    lines: list[UsageLineOut]


def _cents(usd: Decimal | float | None) -> float:
    if usd is None:
        return 0.0
    return round(float(usd) * 100, 4)


def _window(now: datetime) -> tuple[datetime, datetime, datetime]:
    to = now
    frm = to - timedelta(days=_WINDOW_DAYS)
    prior_from = frm - timedelta(days=_WINDOW_DAYS)
    return prior_from, frm, to


async def _sum_cost(db: AsyncSession, ws_id: str, frm: datetime, to: datetime) -> float:
    row = (await db.execute(
        select(func.coalesce(func.sum(LlmUsageEvent.estimated_cost_usd), 0))
        .where(LlmUsageEvent.workspace_id == ws_id,
               LlmUsageEvent.created_at >= frm, LlmUsageEvent.created_at < to)
    )).scalar()
    return _cents(row)


@router.get("/workspaces/{workspace_slug}/ai-usage/",
            response_model=WorkspaceUsageSummaryOut)
async def workspace_ai_usage(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    # Intentionally NOT narrowed to accessible_project_ids, unlike
    # agent/tools/spend.py::ai_spend_summary over these same LlmUsageEvent rows.
    # This is the data source for the workspace Billing settings tab
    # (WalletPage -> UsageDashboard), a page every active member can already open
    # (no role gate in settings-panel-nav.tsx) that deliberately shows the whole
    # workspace's AI spend -- by_project/by_member breakdowns across ALL projects,
    # not just the caller's. Narrowing this would silently undercount that total
    # for anyone without full project membership. The voice tool is a newer
    # surface with no such screen to preserve, so it took the stricter default
    # instead. Investigated for GIN voice-agent-contacts issue 2 -- don't
    # "fix" this to match spend.py without re-checking that screen.
    ws_id = ctx.workspace.id
    now = datetime.now(timezone.utc)
    prior_from, frm, to = _window(now)
    base = (LlmUsageEvent.workspace_id == ws_id,
            LlmUsageEvent.created_at >= frm, LlmUsageEvent.created_at < to)

    total = (await db.execute(
        select(func.coalesce(func.sum(LlmUsageEvent.estimated_cost_usd), 0),
               func.count(LlmUsageEvent.id)).where(*base))).one()
    total_cost_cents = _cents(total[0])
    event_count = int(total[1] or 0)

    # by_project (skip null project_id)
    proj_rows = (await db.execute(
        select(Project.id, Project.name,
               func.coalesce(func.sum(LlmUsageEvent.estimated_cost_usd), 0),
               func.count(LlmUsageEvent.id))
        .join(Project, Project.id == LlmUsageEvent.project_id)
        .where(*base).group_by(Project.id, Project.name)
        .order_by(func.coalesce(func.sum(LlmUsageEvent.estimated_cost_usd), 0).desc()))).all()
    by_project = [BreakdownEntryOut(id=r[0], name=r[1], cost_cents=_cents(r[2]),
                                    event_count=int(r[3] or 0)) for r in proj_rows]

    # by_agent (group by source, friendly labels)
    src_rows = (await db.execute(
        select(LlmUsageEvent.source,
               func.coalesce(func.sum(LlmUsageEvent.estimated_cost_usd), 0),
               func.count(LlmUsageEvent.id))
        .where(*base).group_by(LlmUsageEvent.source))).all()
    by_agent = []
    for source, cost, count in src_rows:
        key = source.value if hasattr(source, "value") else str(source)
        by_agent.append(BreakdownEntryOut(id=key, name=_AGENT_LABELS.get(key, key),
                                          cost_cents=_cents(cost), event_count=int(count or 0)))
    by_agent.sort(key=lambda e: e.cost_cents, reverse=True)

    # by_member
    mem_rows = (await db.execute(
        select(User.id, User.display_name,
               func.coalesce(func.sum(LlmUsageEvent.estimated_cost_usd), 0),
               func.count(LlmUsageEvent.id))
        .join(User, User.id == LlmUsageEvent.user_id)
        .where(*base).group_by(User.id, User.display_name)
        .order_by(func.coalesce(func.sum(LlmUsageEvent.estimated_cost_usd), 0).desc()))).all()
    by_member = [BreakdownEntryOut(id=r[0], name=r[1], cost_cents=_cents(r[2]),
                                   event_count=int(r[3] or 0)) for r in mem_rows]

    # timeseries — zero-filled per day across the window
    day_expr = func.date(LlmUsageEvent.created_at)
    day_rows = (await db.execute(
        select(day_expr,
               func.coalesce(func.sum(LlmUsageEvent.estimated_cost_usd), 0))
        .where(*base).group_by(day_expr))).all()
    by_day: dict[str, float] = {}
    for day, cost in day_rows:
        label = day.isoformat() if hasattr(day, "isoformat") else str(day)
        by_day[label] = _cents(cost)
    start_day = frm.date()
    timeseries = []
    for i in range(_WINDOW_DAYS):
        d = (start_day + timedelta(days=i)).isoformat()
        timeseries.append(TimeseriesPointOut(date=d, cost_cents=by_day.get(d, 0.0)))

    # prior period
    prior_total = await _sum_cost(db, ws_id, prior_from, frm)
    delta = ((total_cost_cents - prior_total) / prior_total) if prior_total else None

    return WorkspaceUsageSummaryOut(
        period=Period(**{"from": frm.date().isoformat(), "to": to.date().isoformat()}),
        total_cost_cents=total_cost_cents,
        event_count=event_count,
        by_project=by_project,
        by_agent=by_agent,
        by_member=by_member,
        timeseries=timeseries,
        prior_period=PriorPeriodOut(total_cost_cents=prior_total, delta_cost_pct=delta),
    )


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/stories/{story_id}"
    "/thread/{thread_id}/usage/",
    response_model=ThreadUsageOut,
)
async def thread_usage(
    project_id: str,
    story_id: str,
    thread_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(LlmUsageEvent)
        .where(LlmUsageEvent.workspace_id == ctx.workspace.id,
               LlmUsageEvent.thread_id == thread_id)
        .order_by(LlmUsageEvent.created_at.asc()))).scalars().all()
    lines = [
        UsageLineOut(
            id=e.id,
            source=e.source.value if hasattr(e.source, "value") else str(e.source),
            operation=e.operation.value if hasattr(e.operation, "value") else str(e.operation),
            model=e.model,
            input_tokens=int(e.input_tokens or 0),
            output_tokens=int(e.output_tokens or 0),
            cost_cents=_cents(e.estimated_cost_usd),
            project_id=e.project_id,
            story_id=e.story_id,
            thread_id=e.thread_id,
            created_at=e.created_at.isoformat() if e.created_at else "",
        )
        for e in rows
    ]
    return ThreadUsageOut(
        thread_id=thread_id,
        total_cost_cents=round(sum(line.cost_cents for line in lines), 4),
        message_count=len(lines),
        lines=lines,
    )
