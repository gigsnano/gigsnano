"""The `project_health` bundle: read-only status a specialist can speak aloud.

Thin over the existing services. `compute_health` (`features/forecasting/service.py`,
GIN-336/339) is the one true "how is this project doing" calculation — nothing
here recomputes it, so voice and the web health card never disagree.
`pm_health/service.py` is a *different* feature (manual PM narrative updates, not
a computed metric) and is not what a "how's it tracking" question wants.

Blockers reuse the same `WorkItemBlocker` model the blockers router reads —
note its open/resolved marker is the `status` enum (`EBlockerStatus.OPEN`), with
`resolved_at`/`resolved_by_id` set alongside it on resolution; there is no bare
boolean flag.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select

from gigsnano_api.agent.tools.base import Tool, ToolContext, ToolRegistry, ToolResult
from gigsnano_api.models import EBlockerStatus, Project, WorkItemBlocker
from gigsnano_api.shared.context import accessible_project_ids

_NO_PROJECT = ToolResult(
    "No project is in scope. Ask the user which project they mean.",
    is_error=True,
    summary="no project in scope",
)


async def _scoped_project(ctx: ToolContext) -> Project | None:
    """The in-scope project, tenant- and membership-checked. `ToolContext` has the
    same `.db`/`.workspace`/`.user`/`.role` shape `accessible_project_ids` expects
    from a `WorkspaceContext` (structural typing, same trick `work_items.py` uses),
    so it's passed straight through: `None` = admin/owner sees every project,
    otherwise it's the caller's active `ProjectMember` rows — same rule
    `get_project_or_404` enforces over HTTP. A workspace member with no membership
    on THIS project must not read its health or blockers just because they're in
    the workspace.
    """
    if not ctx.project_id:
        return None
    project = (
        await ctx.db.execute(select(Project).where(Project.id == ctx.project_id))
    ).scalar_one_or_none()
    if project is None or project.workspace_id != ctx.workspace.id:
        return None
    pids = await accessible_project_ids(ctx.db, ctx)
    if pids is not None and project.id not in pids:
        return None
    return project


async def _health_summary(ctx: ToolContext, _args: dict) -> ToolResult:
    project = await _scoped_project(ctx)
    if project is None:
        return _NO_PROJECT

    from gigsnano_api.features.forecasting.service import compute_health

    health = await compute_health(ctx.db, project, now=datetime.now(timezone.utc))

    lines = [f"{project.name}: {health.status.replace('_', ' ')} (confidence: {health.confidence})"]
    if health.forecast_vs_target:
        lines.append(f"Forecast vs target date: {health.forecast_vs_target}")
    lines.append(f"Remaining work items: {health.remaining_units}")
    lines.extend(f"- {reason.explanation}" for reason in health.reasons)
    return ToolResult("\n".join(lines), summary=f"health: {health.status}")


async def _open_blockers(ctx: ToolContext, _args: dict) -> ToolResult:
    project = await _scoped_project(ctx)
    if project is None:
        return _NO_PROJECT

    rows = (
        await ctx.db.execute(
            select(WorkItemBlocker).where(
                WorkItemBlocker.project_id == project.id,
                WorkItemBlocker.status == EBlockerStatus.OPEN,
            )
        )
    ).scalars().all()
    if not rows:
        return ToolResult("No open blockers.", summary="0 blockers")
    lines = [f"{len(rows)} open blocker(s):"]
    lines.extend(f"- {b.reason or b.external_dependency or 'Unspecified blocker'}" for b in rows)
    return ToolResult("\n".join(lines), summary=f"{len(rows)} blockers")


PROJECT_HEALTH_SUMMARY = Tool(
    name="project_health_summary",
    description=(
        "Current delivery health of the project in scope: status, forecast vs target "
        "date, and the reasons behind it. Use for 'how is the project going?'."
    ),
    input_schema={"type": "object", "properties": {}},
    handler=_health_summary,
)

LIST_OPEN_BLOCKERS = Tool(
    name="list_open_blockers",
    description="Unresolved blockers on the project in scope.",
    input_schema={"type": "object", "properties": {}},
    handler=_open_blockers,
)


def build_health_tools() -> ToolRegistry:
    return ToolRegistry([PROJECT_HEALTH_SUMMARY, LIST_OPEN_BLOCKERS])
