"""Short tool descriptions surfaced through MCP discovery."""

from gigsnano_api.mcp_server.server import DESCRIPTIONS
from gigsnano_api.mcp_server.tools._shared import (
    _FORMAT_NOTE,
)

DESCRIPTIONS.update(
    {
        "list_my_work_items": "List work items assigned to you.",
        "get_work_item": (
            "Fetch a work item's full context by code. The response's "
            "`content_format` field says what `description` holds."
        ),
        "fetch_work_items": (
            "Fetch several work items at once by code (max 50). Prefer this over "
            "repeated get_work_item calls. Unknown codes come back in `errors` "
            "rather than failing the whole batch."
        ),
        "list_sub_work_items": (
            "List an epic's or story's actual sub-items by parent code. Use this "
            "instead of assuming children are the next codes in sequence."
        ),
        "get_work_item_context": (
            "Fetch a work item + its context (parent, children, relations, links, "
            "recent comments, project) in one bounded call; opt into documents/runs/"
            "options/routing via `include`. Every collection reports truncation."
        ),
        "search_work_items": (
            "Search work items across the whole workspace by text. Use before "
            "filing a new item to check it doesn't already exist; needs no project id."
        ),
        "start_work_item": "Claim a work item: In Progress + comment.",
        "add_comment": "Add a comment to a work item." + _FORMAT_NOTE,
        "complete_work_item": "Hand a work item back for review (In Review) with a PR link + summary.",
        "list_work_items": (
            "List work items in a project (status/assignee/q filters, limit/offset). "
            "Returns `total` and `truncated` — check them before concluding you've "
            "seen every item."
        ),
        "create_work_item": "Create a work item in a project." + _FORMAT_NOTE,
        "update_work_item": "Update a work item's fields by code." + _FORMAT_NOTE,
        "list_comments": "List a work item's comments.",
        "update_comment": "Edit a comment." + _FORMAT_NOTE,
        "delete_comment": "Delete a comment.",
        "list_documents": "List a work item's documents.",
        "get_document": "Fetch one document by id.",
        "attach_file": (
            "Attach a file to a work item: PDF, DOCX, text, or a PNG/JPEG/WebP/GIF "
            "image. Pass `content` as base64 (or a data: URL). Images are signature-"
            "validated server-side and previewable in the web app."
        ),
        "delete_document": "Delete a document by id.",
        "list_projects": (
            "List projects in a workspace. Pass `workspace` (a slug from "
            "list_workspaces) to scope the call without set_active_workspace."
        ),
        "get_project": "Fetch a project's details.",
        "list_statuses": "List the project's statuses.",
        "list_labels": "List the project's labels.",
        "create_label": "Create a label (name + color).",
        "list_cycles": "List the project's cycles.",
        "list_modules": "List the project's modules.",
        "list_users": "List workspace members.",
        "get_user": "Fetch a user by id.",
        "get_codebase_overview": (
            "Repository intelligence summary (index freshness, counts, health, "
            "modules, risks, recent changes) with per-section provenance/state. "
            "SHA-pinned; never errors on an unindexed repo."
        ),
        "get_codebase_architecture": (
            "Module/domain-level architecture map: prioritized modules + the "
            "architecture health dimension + edge/symbol counts."
        ),
        "list_codebase_risks": (
            "Severity-ranked findings (security + hotspots) with evidence, location, "
            "and analyzer. Filter by severity/category; paginated."
        ),
        "list_repository_changes": (
            "Recent indexed commits; the index HEAD is flagged. `since` filters by "
            "ISO time; paginated."
        ),
        "trace_codebase_feature": (
            "Search the indexed symbol graph for a feature/query; returns matching "
            "symbols + file locations. Requires a READY index."
        ),
        "get_codebase_evidence": (
            "Resolve risk/module/commit evidence ids to their supporting citations "
            "(file:line, analyzer, message). Never returns raw source."
        ),
        "list_skills": "List registry skills visible in the active workspace (versions, digests, lifecycle).",
        "search_skills": "Search the workspace skill registry by name or manifest description.",
        "get_skill_manifest": "Fetch a skill version's manifest, digest, lifecycle, and authorized bundle URL (no bytes).",
        "resolve_execution_profile": "Resolve a work item's Execution Profile (read-only): pinned skills, gates, confidence.",
        "report_skill_event": "Report one skill delivery/verification event to the run's telemetry log (idempotent).",
        "get_execution_profile": "Get the work item's stored Execution Profile (creating one if none) + stale flag + overrides.",
        "override_execution_profile": "Override a skill's mode in a work item's Execution Profile (403 if policy locked).",
    }
)
