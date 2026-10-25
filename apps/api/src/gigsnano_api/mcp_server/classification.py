"""Read/write classification for the MCP tool surface (GIN-392).

Clients (ChatGPT, Claude) group a connector's tools by `annotations.readOnlyHint`
and treat an unset hint as "this mutates". Not one of our tools set it, so the
connection screen listed every tool — including ~70 pure GETs — under *Write
actions*, and users saw no Read actions at all.

Classified here rather than on every `@mcp.tool` decorator: one list to read when
auditing least privilege, and `test_mcp_tool_annotations.py` fails until a newly
registered tool is listed. A tool absent from READ_ONLY stays classified as a
write, which is the safe default.
"""

from __future__ import annotations

from mcp.types import ToolAnnotations

#: Tools that only ever issue GETs. Verified against the tool sources by
#: tests/mcp/test_mcp_tool_annotations.py — add a tool here only if it cannot mutate.
READ_ONLY = frozenset({
    # connector
    "search",
    "fetch",
    # workspace / directory
    "list_workspaces",
    "whoami",
    "list_users",
    "get_user",
    # projects
    "list_projects",
    "get_project",
    "list_project_structure",
    "list_project_activity",
    "list_statuses",
    "list_labels",
    "get_project_forecast",
    "get_project_changes_since",
    "generate_team_today_plan",
    # cycles / modules / milestones / releases
    "list_cycles",
    "get_cycle",
    "get_cycle_progress",
    "list_cycle_work_items",
    "list_modules",
    "get_module",
    "list_module_work_items",
    "list_milestones",
    "list_releases",
    # work items
    "list_work_items",
    "list_my_work_items",
    "list_sub_work_items",
    "search_work_items",
    "fetch_work_items",
    "get_work_item",
    "get_work_item_context",
    "get_work_item_history",
    "get_work_item_readiness",
    "list_work_item_relations",
    "list_stale_work_items",
    "audit_project_work_items",
    "detect_duplicate_work_items",
    "validate_done_transition",
    "route_work_item",
    "resolve_execution_profile",
    # comments / documents
    "list_comments",
    "list_documents",
    "get_document",
    # blockers / risks / decisions / escalations
    "list_project_blockers",
    "list_work_item_blockers",
    "list_project_risks",
    "get_project_risk",
    "list_open_project_decisions",
    "get_project_decision",
    "list_open_project_escalations",
    # project director / recovery / control runs
    "get_project_autonomy_policy",
    "list_project_director_actions",
    "get_project_director_action",
    "list_project_recovery_plans",
    "get_project_recovery_plan",
    "list_project_control_runs",
    "get_project_control_run",
    # codebase
    "get_codebase_overview",
    "get_codebase_architecture",
    "get_codebase_evidence",
    "list_codebase_risks",
    "list_repository_changes",
    "trace_codebase_feature",
    # document-package import (GIN-399)
    "get_project_package",
    "list_project_findings",
    "preview_project_import",
    "get_document_traceability",
    "list_project_intake_gaps",
    "get_project_intake_status",
    # skills
    "list_skills",
    "search_skills",
    "get_skill_manifest",
})

#: Writes that remove or roll back state, rather than only adding to it. Everything
#: else classified as a write is additive (destructiveHint=False).
DESTRUCTIVE = frozenset({
    "delete_comment",
    "delete_cycle",
    "delete_document",
    "delete_milestone",
    "delete_module",
    "delete_work_item_relation",
    "bulk_remove_work_items_from_module",
    "rollback_project_recovery_plan",
    "rollback_project_import",
})


def title_for(name: str) -> str:
    """`list_work_items` -> `List work items` — a name for the permission screen
    rather than the internal function name (GIN-392 AC8)."""
    return name.replace("_", " ").capitalize()


def apply_annotations(mcp) -> None:
    """Annotate every registered tool. Called once after the tool modules import."""
    for name, tool in mcp._tool_manager._tools.items():
        read_only = name in READ_ONLY
        tool.title = tool.title or title_for(name)
        tool.annotations = ToolAnnotations(
            title=tool.title,
            readOnlyHint=read_only,
            # Meaningful only for writes; defaults to true client-side, so state it.
            destructiveHint=None if read_only else name in DESTRUCTIVE,
            openWorldHint=False,
        )
