"""The `spend_time` bundle: what the work has cost so far.

Read-only by construction — every tool here is a SELECT. A finance specialist
that could move money is a different product with a different review.

Unlike the `project_health` bundle, "no project in scope" is a legitimate
question here, not an error: both tools answer for the whole workspace when
no project is in scope, and narrow to one project when it is. Neither answer is
unscoped, though: naming a project runs the tenant + membership check
(`_scoped_project`, copied from `health.py`'s reference implementation, same
rule `get_project_or_404` enforces over HTTP), and the workspace-wide answer is
narrowed to `accessible_project_ids` — see `_scope`. A rejected project, and a
caller with no accessible projects at all, resolve to the exact same "no project
in scope" message as an absent one, never a distinct "you lack access":
confirming the numbers exist at all is the leak.

`TimeEntry` carries no workspace_id/project_id of its own (GIN-55) — it only
has `story_id`, so project scoping joins through `Story.project_id`. `hours`
is a float, not minutes; converted to whole minutes for display.
`LlmUsageEvent` already carries `workspace_id`/`project_id` directly (used
as-is by `billing/ai_usage.py`), so its total is a single-column sum — no
second cost calculation invented here.
"""

from __future__ import annotations

from sqlalchemy import func, select

from gigsnano_api.agent.tools.base import Tool, ToolContext, ToolRegistry, ToolResult
from gigsnano_api.models import LlmUsageEvent, Project, Story, TimeEntry
from gigsnano_api.shared.context import accessible_project_ids

_NO_PROJECT = ToolResult(
    "No project is in scope. Ask the user which project they mean.",
    is_error=True,
    summary="no project in scope",
)


async def _scoped_project(ctx: ToolContext) -> Project | None:
    """The in-scope project, tenant- and membership-checked (same check as
    `health.py::_scoped_project`). Returns None if no project is asked for —
    callers here treat that as "workspace-wide", not an error."""
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


async def _scope(ctx: ToolContext) -> tuple[str | None, list[str] | None] | None:
    """`(project_id, allowed_project_ids)` for this call, or `None` to refuse.

    `allowed` is `None` for Owner/Admin — they really do see the whole workspace.
    For everyone else the workspace-wide total is narrowed to
    `accessible_project_ids`, which is the same gate the HTTP sibling over the
    same rows applies (`features/time_tracking/router.py::workspace_time_entries`
    filters `Story.project_id.in_(...)` with this exact helper). Without it a
    member with no project memberships — or a Viewer — could ask a microphone
    for the workspace's whole spend, which no HTTP route would have told them.

    A caller with zero accessible projects is refused with the *identical*
    `_NO_PROJECT` message an out-of-scope project gets: a distinct "you lack
    access" is what confirms the numbers exist.
    """
    if ctx.project_id:
        project = await _scoped_project(ctx)
        return None if project is None else (project.id, None)
    allowed = await accessible_project_ids(ctx.db, ctx)
    if allowed is not None and not allowed:
        return None
    return None, allowed


async def _time_logged(ctx: ToolContext, _args: dict) -> ToolResult:
    scope = await _scope(ctx)
    if scope is None:
        return _NO_PROJECT
    project_id, allowed = scope

    stmt = (
        select(func.coalesce(func.sum(TimeEntry.hours), 0.0))
        .select_from(TimeEntry)
        .join(Story, Story.id == TimeEntry.story_id)
        .join(Project, Project.id == Story.project_id)
        .where(Project.workspace_id == ctx.workspace.id)
    )
    if project_id:
        stmt = stmt.where(Story.project_id == project_id)
    elif allowed is not None:
        stmt = stmt.where(Story.project_id.in_(allowed))
    total_hours = float((await ctx.db.execute(stmt)).scalar_one())
    total_minutes = round(total_hours * 60)
    hours, minutes = divmod(total_minutes, 60)
    if project_id:
        scope_label = "this project"
    elif allowed is None:
        scope_label = "the workspace"
    else:
        # Narrowed to `accessible_project_ids`, not the whole workspace (same
        # narrowing `_ai_spend` applies) — "the workspace" here would tell a
        # non-admin they're hearing a total that's actually partial.
        scope_label = "your accessible projects"
    return ToolResult(
        f"{hours} hours {minutes} minutes logged against {scope_label}.",
        summary=f"{total_minutes}m logged",
    )


async def _ai_spend(ctx: ToolContext, _args: dict) -> ToolResult:
    # Deliberately stricter than `billing/ai_usage.py::workspace_ai_usage`, which
    # serves the same LlmUsageEvent rows unfiltered to any active workspace member
    # over HTTP (`/workspaces/{slug}/ai-usage/`). That endpoint backs the Billing
    # settings tab (`WalletPage` -> `UsageDashboard`), a screen every member can
    # already open (no role gate in `settings-panel-nav.tsx`) and whose by_project/
    # by_member breakdowns are the whole-workspace expense picture on purpose.
    # Narrowing it to `accessible_project_ids` would silently undercount that
    # total for anyone without full project membership -- a worse bug than the
    # inconsistency. The voice tool has no such existing screen to preserve, so it
    # takes the stricter, membership-aware default instead. Investigated for GIN
    # voice-agent-contacts issue 2; not a change to make lightly.
    scope = await _scope(ctx)
    if scope is None:
        return _NO_PROJECT
    project_id, allowed = scope

    stmt = select(func.coalesce(func.sum(LlmUsageEvent.estimated_cost_usd), 0)).where(
        LlmUsageEvent.workspace_id == ctx.workspace.id
    )
    if project_id:
        stmt = stmt.where(LlmUsageEvent.project_id == project_id)
    elif allowed is not None:
        # Non-admins also lose the workspace-level rows (`project_id IS NULL`,
        # e.g. the GigsAI pane). That is the safe direction: those are the rows
        # least attributable to a project the caller is actually on.
        stmt = stmt.where(LlmUsageEvent.project_id.in_(allowed))
    total = (await ctx.db.execute(stmt)).scalar_one()
    scope = "this project" if project_id else "the workspace"
    return ToolResult(
        f"AI spend to date for {scope}: {float(total or 0):.2f} USD.", summary="ai spend"
    )


TIME_LOGGED_SUMMARY = Tool(
    name="time_logged_summary",
    description=(
        "Total time logged against the project in scope, or the whole workspace when "
        "no project is in scope. Use for 'how many hours have we put in?'."
    ),
    input_schema={"type": "object", "properties": {}},
    handler=_time_logged,
)

AI_SPEND_SUMMARY = Tool(
    name="ai_spend_summary",
    description=(
        "Total AI spend to date for the project in scope, or the whole workspace when "
        "no project is in scope. Use for 'what have we spent on AI?'."
    ),
    input_schema={"type": "object", "properties": {}},
    handler=_ai_spend,
)


def build_spend_tools() -> ToolRegistry:
    return ToolRegistry([TIME_LOGGED_SUMMARY, AI_SPEND_SUMMARY])
