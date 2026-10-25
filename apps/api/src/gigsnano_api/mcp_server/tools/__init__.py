"""MCP tool surface.

One import per module so every `@mcp.tool` decorator runs at import time, then a
flat re-export: `from gigsnano_api.mcp_server import tools` still resolves every
tool as `tools.<name>`, exactly as when this was a single 2 200-line module.
"""

from gigsnano_api.mcp_server.api import ApiError as ApiError
from gigsnano_api.mcp_server.classification import (  # noqa: E402 — after every tool registers
    apply_annotations,
)
from gigsnano_api.mcp_server.prompts import install_prompts  # noqa: E402
from gigsnano_api.mcp_server.server import mcp as _mcp  # noqa: E402
from gigsnano_api.mcp_server.tools import _descriptions as _descriptions  # fills DESCRIPTIONS
from gigsnano_api.mcp_server.tools._shared import (
    CONNECTOR_RESULTS as CONNECTOR_RESULTS,
)
from gigsnano_api.mcp_server.tools._shared import (
    CONTEXT_ALL_INCLUDES as CONTEXT_ALL_INCLUDES,
)
from gigsnano_api.mcp_server.tools._shared import (
    CONTEXT_DEFAULT_INCLUDES as CONTEXT_DEFAULT_INCLUDES,
)
from gigsnano_api.mcp_server.tools._shared import (
    CONTEXT_OPTIONAL_INCLUDES as CONTEXT_OPTIONAL_INCLUDES,
)
from gigsnano_api.mcp_server.tools._shared import (
    DEFAULT_CONTENT_FORMAT as DEFAULT_CONTENT_FORMAT,
)
from gigsnano_api.mcp_server.tools._shared import (
    MAX_BULK_CODES as MAX_BULK_CODES,
)
from gigsnano_api.mcp_server.tools._shared import (
    MAX_CONTEXT_COMMENTS as MAX_CONTEXT_COMMENTS,
)
from gigsnano_api.mcp_server.tools._shared import (
    MAX_CONTEXT_ITEMS as MAX_CONTEXT_ITEMS,
)
from gigsnano_api.mcp_server.tools._shared import (
    MAX_PAGE as MAX_PAGE,
)
from gigsnano_api.mcp_server.tools._shared import (
    _collection as _collection,
)
from gigsnano_api.mcp_server.tools._shared import (
    _highlight as _highlight,
)
from gigsnano_api.mcp_server.tools._shared import (
    _match_evidence as _match_evidence,
)
from gigsnano_api.mcp_server.tools._shared import (
    _plain as _plain,
)
from gigsnano_api.mcp_server.tools._shared import (
    _resolve_parent_id as _resolve_parent_id,
)
from gigsnano_api.mcp_server.tools._shared import (
    _resolve_story as _resolve_story,
)
from gigsnano_api.mcp_server.tools._shared import (
    _summarize as _summarize,
)
from gigsnano_api.mcp_server.tools._shared import (
    _with_query as _with_query,
)
from gigsnano_api.mcp_server.tools.codebase import (
    get_codebase_architecture as get_codebase_architecture,
)
from gigsnano_api.mcp_server.tools.codebase import (
    get_codebase_evidence as get_codebase_evidence,
)
from gigsnano_api.mcp_server.tools.codebase import (
    get_codebase_overview as get_codebase_overview,
)
from gigsnano_api.mcp_server.tools.codebase import (
    list_codebase_risks as list_codebase_risks,
)
from gigsnano_api.mcp_server.tools.codebase import (
    list_repository_changes as list_repository_changes,
)
from gigsnano_api.mcp_server.tools.codebase import (
    trace_codebase_feature as trace_codebase_feature,
)
from gigsnano_api.mcp_server.tools.connector import (
    fetch as fetch,
)
from gigsnano_api.mcp_server.tools.connector import (
    search as search,
)
from gigsnano_api.mcp_server.tools.package_import import (
    analyse_project_documents as analyse_project_documents,
)
from gigsnano_api.mcp_server.tools.package_import import (
    apply_project_import as apply_project_import,
)
from gigsnano_api.mcp_server.tools.package_import import (
    classify_project_documents as classify_project_documents,
)
from gigsnano_api.mcp_server.tools.package_import import (
    decide_project_import_changes as decide_project_import_changes,
)
from gigsnano_api.mcp_server.tools.package_import import (
    get_document_traceability as get_document_traceability,
)
from gigsnano_api.mcp_server.tools.package_import import (
    get_project_intake_status as get_project_intake_status,
)
from gigsnano_api.mcp_server.tools.package_import import (
    get_project_package as get_project_package,
)
from gigsnano_api.mcp_server.tools.package_import import (
    list_project_findings as list_project_findings,
)
from gigsnano_api.mcp_server.tools.package_import import (
    list_project_intake_gaps as list_project_intake_gaps,
)
from gigsnano_api.mcp_server.tools.package_import import (
    preview_project_import as preview_project_import,
)
from gigsnano_api.mcp_server.tools.package_import import (
    propose_project_structure_from_documents as propose_project_structure_from_documents,
)
from gigsnano_api.mcp_server.tools.package_import import (
    resolve_project_intake_gap as resolve_project_intake_gap,
)
from gigsnano_api.mcp_server.tools.package_import import (
    rollback_project_import as rollback_project_import,
)
from gigsnano_api.mcp_server.tools.package_import import (
    set_canonical_project_document as set_canonical_project_document,
)
from gigsnano_api.mcp_server.tools.package_import import (
    upload_project_package as upload_project_package,
)
from gigsnano_api.mcp_server.tools.projects import (
    apply_project_recovery_plan as apply_project_recovery_plan,
)
from gigsnano_api.mcp_server.tools.projects import (
    approve_project_director_action as approve_project_director_action,
)
from gigsnano_api.mcp_server.tools.projects import (
    approve_project_recovery_plan as approve_project_recovery_plan,
)
from gigsnano_api.mcp_server.tools.projects import (
    audit_project_work_items as audit_project_work_items,
)
from gigsnano_api.mcp_server.tools.projects import (
    bulk_assign_work_items_to_cycle as bulk_assign_work_items_to_cycle,
)
from gigsnano_api.mcp_server.tools.projects import (
    bulk_assign_work_items_to_module as bulk_assign_work_items_to_module,
)
from gigsnano_api.mcp_server.tools.projects import (
    bulk_assign_work_items_to_owner as bulk_assign_work_items_to_owner,
)
from gigsnano_api.mcp_server.tools.projects import (
    bulk_change_work_item_status as bulk_change_work_item_status,
)
from gigsnano_api.mcp_server.tools.projects import (
    bulk_create_work_item_relations as bulk_create_work_item_relations,
)
from gigsnano_api.mcp_server.tools.projects import (
    bulk_remove_work_items_from_module as bulk_remove_work_items_from_module,
)
from gigsnano_api.mcp_server.tools.projects import (
    bulk_set_work_item_dates as bulk_set_work_item_dates,
)
from gigsnano_api.mcp_server.tools.projects import (
    bulk_update_work_items as bulk_update_work_items,
)
from gigsnano_api.mcp_server.tools.projects import (
    close_project_risk as close_project_risk,
)
from gigsnano_api.mcp_server.tools.projects import (
    create_cycle as create_cycle,
)
from gigsnano_api.mcp_server.tools.projects import (
    create_label as create_label,
)
from gigsnano_api.mcp_server.tools.projects import (
    create_milestone as create_milestone,
)
from gigsnano_api.mcp_server.tools.projects import (
    create_module as create_module,
)
from gigsnano_api.mcp_server.tools.projects import (
    create_project_decision as create_project_decision,
)
from gigsnano_api.mcp_server.tools.projects import (
    create_project_escalation as create_project_escalation,
)
from gigsnano_api.mcp_server.tools.projects import (
    create_project_recovery_plan as create_project_recovery_plan,
)
from gigsnano_api.mcp_server.tools.projects import (
    create_project_risk as create_project_risk,
)
from gigsnano_api.mcp_server.tools.projects import (
    create_release as create_release,
)
from gigsnano_api.mcp_server.tools.projects import (
    create_work_item_relation as create_work_item_relation,
)
from gigsnano_api.mcp_server.tools.projects import (
    delete_cycle as delete_cycle,
)
from gigsnano_api.mcp_server.tools.projects import (
    delete_milestone as delete_milestone,
)
from gigsnano_api.mcp_server.tools.projects import (
    delete_module as delete_module,
)
from gigsnano_api.mcp_server.tools.projects import (
    delete_work_item_relation as delete_work_item_relation,
)
from gigsnano_api.mcp_server.tools.projects import (
    detect_duplicate_work_items as detect_duplicate_work_items,
)
from gigsnano_api.mcp_server.tools.projects import (
    escalate_blocker as escalate_blocker,
)
from gigsnano_api.mcp_server.tools.projects import (
    generate_team_today_plan as generate_team_today_plan,
)
from gigsnano_api.mcp_server.tools.projects import (
    get_cycle as get_cycle,
)
from gigsnano_api.mcp_server.tools.projects import (
    get_cycle_progress as get_cycle_progress,
)
from gigsnano_api.mcp_server.tools.projects import (
    get_module as get_module,
)
from gigsnano_api.mcp_server.tools.projects import (
    get_project as get_project,
)
from gigsnano_api.mcp_server.tools.projects import (
    get_project_autonomy_policy as get_project_autonomy_policy,
)
from gigsnano_api.mcp_server.tools.projects import (
    get_project_changes_since as get_project_changes_since,
)
from gigsnano_api.mcp_server.tools.projects import (
    get_project_control_run as get_project_control_run,
)
from gigsnano_api.mcp_server.tools.projects import (
    get_project_decision as get_project_decision,
)
from gigsnano_api.mcp_server.tools.projects import (
    get_project_director_action as get_project_director_action,
)
from gigsnano_api.mcp_server.tools.projects import (
    get_project_forecast as get_project_forecast,
)
from gigsnano_api.mcp_server.tools.projects import (
    get_project_recovery_plan as get_project_recovery_plan,
)
from gigsnano_api.mcp_server.tools.projects import (
    get_project_risk as get_project_risk,
)
from gigsnano_api.mcp_server.tools.projects import (
    get_user as get_user,
)
from gigsnano_api.mcp_server.tools.projects import (
    get_work_item_history as get_work_item_history,
)
from gigsnano_api.mcp_server.tools.projects import (
    get_work_item_readiness as get_work_item_readiness,
)
from gigsnano_api.mcp_server.tools.projects import (
    link_work_items_to_milestone as link_work_items_to_milestone,
)
from gigsnano_api.mcp_server.tools.projects import (
    link_work_items_to_release as link_work_items_to_release,
)
from gigsnano_api.mcp_server.tools.projects import (
    list_cycle_work_items as list_cycle_work_items,
)
from gigsnano_api.mcp_server.tools.projects import (
    list_cycles as list_cycles,
)
from gigsnano_api.mcp_server.tools.projects import (
    list_labels as list_labels,
)
from gigsnano_api.mcp_server.tools.projects import (
    list_milestones as list_milestones,
)
from gigsnano_api.mcp_server.tools.projects import (
    list_module_work_items as list_module_work_items,
)
from gigsnano_api.mcp_server.tools.projects import (
    list_modules as list_modules,
)
from gigsnano_api.mcp_server.tools.projects import (
    list_open_project_decisions as list_open_project_decisions,
)
from gigsnano_api.mcp_server.tools.projects import (
    list_open_project_escalations as list_open_project_escalations,
)
from gigsnano_api.mcp_server.tools.projects import (
    list_project_activity as list_project_activity,
)
from gigsnano_api.mcp_server.tools.projects import (
    list_project_blockers as list_project_blockers,
)
from gigsnano_api.mcp_server.tools.projects import (
    list_project_control_runs as list_project_control_runs,
)
from gigsnano_api.mcp_server.tools.projects import (
    list_project_director_actions as list_project_director_actions,
)
from gigsnano_api.mcp_server.tools.projects import (
    list_project_recovery_plans as list_project_recovery_plans,
)
from gigsnano_api.mcp_server.tools.projects import (
    list_project_risks as list_project_risks,
)
from gigsnano_api.mcp_server.tools.projects import (
    list_project_structure as list_project_structure,
)
from gigsnano_api.mcp_server.tools.projects import (
    list_projects as list_projects,
)
from gigsnano_api.mcp_server.tools.projects import (
    list_releases as list_releases,
)
from gigsnano_api.mcp_server.tools.projects import (
    list_stale_work_items as list_stale_work_items,
)
from gigsnano_api.mcp_server.tools.projects import (
    list_statuses as list_statuses,
)
from gigsnano_api.mcp_server.tools.projects import (
    list_users as list_users,
)
from gigsnano_api.mcp_server.tools.projects import (
    list_work_item_blockers as list_work_item_blockers,
)
from gigsnano_api.mcp_server.tools.projects import (
    list_work_item_relations as list_work_item_relations,
)
from gigsnano_api.mcp_server.tools.projects import (
    mark_work_item_blocked as mark_work_item_blocked,
)
from gigsnano_api.mcp_server.tools.projects import (
    pause_project_director as pause_project_director,
)
from gigsnano_api.mcp_server.tools.projects import (
    reject_project_director_action as reject_project_director_action,
)
from gigsnano_api.mcp_server.tools.projects import (
    reject_project_recovery_plan as reject_project_recovery_plan,
)
from gigsnano_api.mcp_server.tools.projects import (
    request_project_director_action as request_project_director_action,
)
from gigsnano_api.mcp_server.tools.projects import (
    resolve_blocker as resolve_blocker,
)
from gigsnano_api.mcp_server.tools.projects import (
    resolve_project_decision as resolve_project_decision,
)
from gigsnano_api.mcp_server.tools.projects import (
    resolve_project_escalation as resolve_project_escalation,
)
from gigsnano_api.mcp_server.tools.projects import (
    resume_project_director as resume_project_director,
)
from gigsnano_api.mcp_server.tools.projects import (
    rollback_project_recovery_plan as rollback_project_recovery_plan,
)
from gigsnano_api.mcp_server.tools.projects import (
    run_project_control_cycle as run_project_control_cycle,
)
from gigsnano_api.mcp_server.tools.projects import (
    update_blocker as update_blocker,
)
from gigsnano_api.mcp_server.tools.projects import (
    update_cycle as update_cycle,
)
from gigsnano_api.mcp_server.tools.projects import (
    update_milestone as update_milestone,
)
from gigsnano_api.mcp_server.tools.projects import (
    update_module as update_module,
)
from gigsnano_api.mcp_server.tools.projects import (
    update_project_autonomy_policy as update_project_autonomy_policy,
)
from gigsnano_api.mcp_server.tools.projects import (
    update_project_escalation as update_project_escalation,
)
from gigsnano_api.mcp_server.tools.projects import (
    update_project_risk as update_project_risk,
)
from gigsnano_api.mcp_server.tools.projects import (
    update_release as update_release,
)
from gigsnano_api.mcp_server.tools.projects import (
    validate_done_transition as validate_done_transition,
)
from gigsnano_api.mcp_server.tools.skills import (
    get_skill_manifest as get_skill_manifest,
)
from gigsnano_api.mcp_server.tools.skills import (
    list_skills as list_skills,
)
from gigsnano_api.mcp_server.tools.skills import (
    search_skills as search_skills,
)
from gigsnano_api.mcp_server.tools.work_items import (
    add_comment as add_comment,
)
from gigsnano_api.mcp_server.tools.work_items import (
    attach_file as attach_file,
)
from gigsnano_api.mcp_server.tools.work_items import (
    complete_work_item as complete_work_item,
)
from gigsnano_api.mcp_server.tools.work_items import (
    coordinate_work_item as coordinate_work_item,
)
from gigsnano_api.mcp_server.tools.work_items import (
    create_work_item as create_work_item,
)
from gigsnano_api.mcp_server.tools.work_items import (
    delete_comment as delete_comment,
)
from gigsnano_api.mcp_server.tools.work_items import (
    delete_document as delete_document,
)
from gigsnano_api.mcp_server.tools.work_items import (
    fetch_work_items as fetch_work_items,
)
from gigsnano_api.mcp_server.tools.work_items import (
    get_document as get_document,
)
from gigsnano_api.mcp_server.tools.work_items import (
    get_execution_profile as get_execution_profile,
)
from gigsnano_api.mcp_server.tools.work_items import (
    get_work_item as get_work_item,
)
from gigsnano_api.mcp_server.tools.work_items import (
    get_work_item_context as get_work_item_context,
)
from gigsnano_api.mcp_server.tools.work_items import (
    list_comments as list_comments,
)
from gigsnano_api.mcp_server.tools.work_items import (
    list_documents as list_documents,
)
from gigsnano_api.mcp_server.tools.work_items import (
    list_my_work_items as list_my_work_items,
)
from gigsnano_api.mcp_server.tools.work_items import (
    list_sub_work_items as list_sub_work_items,
)
from gigsnano_api.mcp_server.tools.work_items import (
    list_work_items as list_work_items,
)
from gigsnano_api.mcp_server.tools.work_items import (
    list_workspaces as list_workspaces,
)
from gigsnano_api.mcp_server.tools.work_items import (
    override_execution_profile as override_execution_profile,
)
from gigsnano_api.mcp_server.tools.work_items import (
    report_skill_event as report_skill_event,
)
from gigsnano_api.mcp_server.tools.work_items import (
    resolve_execution_profile as resolve_execution_profile,
)
from gigsnano_api.mcp_server.tools.work_items import (
    route_work_item as route_work_item,
)
from gigsnano_api.mcp_server.tools.work_items import (
    search_work_items as search_work_items,
)
from gigsnano_api.mcp_server.tools.work_items import (
    set_active_workspace as set_active_workspace,
)
from gigsnano_api.mcp_server.tools.work_items import (
    start_work_item as start_work_item,
)
from gigsnano_api.mcp_server.tools.work_items import (
    update_comment as update_comment,
)
from gigsnano_api.mcp_server.tools.work_items import (
    update_work_item as update_work_item,
)
from gigsnano_api.mcp_server.tools.work_items import (
    whoami as whoami,
)

apply_annotations(_mcp)
install_prompts(_mcp)

__all__ = [
    "analyse_project_documents",
    "apply_project_import",
    "classify_project_documents",
    "decide_project_import_changes",
    "get_document_traceability",
    "get_project_intake_status",
    "get_project_package",
    "list_project_findings",
    "list_project_intake_gaps",
    "preview_project_import",
    "propose_project_structure_from_documents",
    "resolve_project_intake_gap",
    "rollback_project_import",
    "set_canonical_project_document",
    "upload_project_package",
    "generate_team_today_plan",
    "list_stale_work_items",
    "get_project_changes_since",
    "get_project_control_run",
    "list_project_control_runs",
    "run_project_control_cycle",
    "rollback_project_recovery_plan",
    "apply_project_recovery_plan",
    "reject_project_recovery_plan",
    "approve_project_recovery_plan",
    "get_project_recovery_plan",
    "list_project_recovery_plans",
    "create_project_recovery_plan",
    "resolve_project_escalation",
    "update_project_escalation",
    "list_open_project_escalations",
    "create_project_escalation",
    "resolve_project_decision",
    "get_project_decision",
    "list_open_project_decisions",
    "create_project_decision",
    "close_project_risk",
    "update_project_risk",
    "get_project_risk",
    "list_project_risks",
    "create_project_risk",
    "escalate_blocker",
    "resolve_blocker",
    "update_blocker",
    "list_work_item_blockers",
    "list_project_blockers",
    "mark_work_item_blocked",
    "resume_project_director",
    "pause_project_director",
    "reject_project_director_action",
    "approve_project_director_action",
    "get_project_director_action",
    "list_project_director_actions",
    "request_project_director_action",
    "update_project_autonomy_policy",
    "get_project_autonomy_policy",
    "detect_duplicate_work_items",
    "get_work_item_readiness",
    "audit_project_work_items",
    "ApiError",
    "add_comment",
    "attach_file",
    "bulk_assign_work_items_to_cycle",
    "bulk_assign_work_items_to_module",
    "bulk_assign_work_items_to_owner",
    "bulk_change_work_item_status",
    "bulk_create_work_item_relations",
    "bulk_remove_work_items_from_module",
    "bulk_set_work_item_dates",
    "bulk_update_work_items",
    "complete_work_item",
    "coordinate_work_item",
    "create_cycle",
    "create_label",
    "create_milestone",
    "create_module",
    "create_release",
    "create_work_item",
    "create_work_item_relation",
    "delete_comment",
    "delete_cycle",
    "delete_document",
    "delete_milestone",
    "delete_module",
    "delete_work_item_relation",
    "fetch",
    "fetch_work_items",
    "get_codebase_architecture",
    "get_codebase_evidence",
    "get_codebase_overview",
    "get_cycle",
    "get_cycle_progress",
    "get_document",
    "get_execution_profile",
    "get_module",
    "get_project",
    "get_project_forecast",
    "get_skill_manifest",
    "get_user",
    "get_work_item",
    "get_work_item_context",
    "get_work_item_history",
    "link_work_items_to_milestone",
    "link_work_items_to_release",
    "list_codebase_risks",
    "list_comments",
    "list_cycle_work_items",
    "list_cycles",
    "list_documents",
    "list_labels",
    "list_milestones",
    "list_module_work_items",
    "list_modules",
    "list_my_work_items",
    "list_project_activity",
    "list_project_structure",
    "list_projects",
    "list_releases",
    "list_repository_changes",
    "list_skills",
    "list_statuses",
    "list_sub_work_items",
    "list_users",
    "list_work_item_relations",
    "list_work_items",
    "list_workspaces",
    "override_execution_profile",
    "report_skill_event",
    "resolve_execution_profile",
    "route_work_item",
    "search",
    "search_skills",
    "search_work_items",
    "set_active_workspace",
    "start_work_item",
    "trace_codebase_feature",
    "update_comment",
    "update_cycle",
    "update_milestone",
    "update_module",
    "update_release",
    "update_work_item",
    "validate_done_transition",
    "whoami",
]
