"""Project-level tools: projects and their settings, modules (GIN-380) and the
planning/bulk/relations control plane (GIN-382)."""

import asyncio

from gigsnano_api.mcp_server.api import (
    ApiError,
    TPayload,
    api,
    default_workspace,
    resolve_ctx,
    text,
)
from gigsnano_api.mcp_server.server import mcp
from gigsnano_api.mcp_server.tools._shared import (
    MAX_BULK_CODES,
    MAX_PAGE,
    _collection,
    _resolve_story,
    _with_query,
)


@mcp.tool(
    description=(
        "List projects in a workspace. Pass `workspace` (a slug from "
        "list_workspaces) to scope the call without set_active_workspace; omit it "
        "to use the active workspace. Project-scoped tools take the same shortcut "
        "as project='<workspace_slug>/<project_id>'."
    )
)
async def list_projects(workspace: str | None = None) -> TPayload:
    # Scoping inline matters beyond convenience: set_active_workspace is a separate,
    # stateful round-trip, and a client that can't complete it (ChatGPT's connector
    # drops tool routes mid-session) is otherwise locked out of every workspace tool
    # — or, worse, silently served the previously-active workspace's projects.
    slug = workspace or await default_workspace()
    return text(await api("GET", f"/workspaces/{slug}/projects/"))


@mcp.tool(description="Fetch a project's details.")
async def get_project(project: str) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(await api("GET", f"/workspaces/{slug}/projects/{pid}/"))


@mcp.tool(description="List the project's statuses.")
async def list_statuses(project: str) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(await api("GET", f"/workspaces/{slug}/projects/{pid}/states/"))


@mcp.tool(description="List the project's labels.")
async def list_labels(project: str) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(await api("GET", f"/workspaces/{slug}/projects/{pid}/labels/"))


@mcp.tool(description="Create a label (name + color).")
async def create_label(project: str, name: str, color: str = "#6b7280") -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(
        await api(
            "POST",
            f"/workspaces/{slug}/projects/{pid}/labels/",
            {"name": name, "color": color},
        )
    )


@mcp.tool(description="List the project's cycles.")
async def list_cycles(project: str) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(await api("GET", f"/workspaces/{slug}/projects/{pid}/cycles/"))


@mcp.tool(description="List the project's modules (workstreams), with work-item counts.")
async def list_modules(project: str) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(await api("GET", f"/workspaces/{slug}/projects/{pid}/modules/"))


# ---- Module management (GIN-380) ------------------------------------------
# Enough to reorganize an existing project into workstreams without the UI:
# create/read/update/delete a module, then move work items in or out in bulk.


@mcp.tool(
    description=(
        "Create a module (workstream) in a project and return it, including its `id`. "
        "Optional `status` is one of backlog/planned/in_progress/completed; `lead_id` is "
        "a workspace member id; `start_date`/`target_date` are YYYY-MM-DD; `color` is a "
        "hex swatch like '#6b7280'. A duplicate name in the same project (trimmed, "
        "case-insensitive) is rejected with `duplicate_module_name`."
    )
)
async def create_module(
    project: str,
    name: str,
    description: str = "",
    status: str | None = None,
    lead_id: str | None = None,
    start_date: str | None = None,
    target_date: str | None = None,
    color: str | None = None,
) -> TPayload:
    slug, pid = await resolve_ctx(project)
    payload = {k: v for k, v in {
        "name": name, "description": description, "status": status, "lead_id": lead_id,
        "start_date": start_date, "target_date": target_date, "color": color,
    }.items() if v is not None}
    return text(await api("POST", f"/workspaces/{slug}/projects/{pid}/modules/", payload))


@mcp.tool(description="Fetch one module by id, with its work-item counts.")
async def get_module(project: str, module_id: str) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(await api("GET", f"/workspaces/{slug}/projects/{pid}/modules/{module_id}/"))


@mcp.tool(description="List the work items assigned to a module.")
async def list_module_work_items(project: str, module_id: str) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(
        await api("GET", f"/workspaces/{slug}/projects/{pid}/modules/{module_id}/stories/")
    )


@mcp.tool(
    description=(
        "Update a module's name, description, status, lead, dates (YYYY-MM-DD) or "
        "color. Only the fields you pass change; a duplicate name is rejected with "
        "`duplicate_module_name`."
    )
)
async def update_module(
    project: str,
    module_id: str,
    name: str | None = None,
    description: str | None = None,
    status: str | None = None,
    lead_id: str | None = None,
    start_date: str | None = None,
    target_date: str | None = None,
    color: str | None = None,
) -> TPayload:
    slug, pid = await resolve_ctx(project)
    patch = {k: v for k, v in {
        "name": name, "description": description, "status": status, "lead_id": lead_id,
        "start_date": start_date, "target_date": target_date, "color": color,
    }.items() if v is not None}
    return text(
        await api("PATCH", f"/workspaces/{slug}/projects/{pid}/modules/{module_id}/", patch)
    )


@mcp.tool(
    description=(
        "Delete a module. `on_work_items` states what happens to items still in it: "
        "'reject' (default — fails with `module_has_work_items` while any remain), "
        "'unassign' (clears their module), or 'move' (needs `move_to_module_id`)."
    )
)
async def delete_module(
    project: str,
    module_id: str,
    on_work_items: str = "reject",
    move_to_module_id: str | None = None,
) -> TPayload:
    slug, pid = await resolve_ctx(project)
    path = _with_query(
        f"/workspaces/{slug}/projects/{pid}/modules/{module_id}/",
        on_work_items=on_work_items,
        move_to_module_id=move_to_module_id,
    )
    return text(await api("DELETE", path))


@mcp.tool(
    description=(
        "Assign many work items to one module in a single request — use this instead "
        "of calling update_work_item per item. Codes are work-item codes (e.g. "
        "['GIN-12','GIN-13']) and must belong to `project`; cross-project codes come "
        "back under `failed`. Only `module_id` is written, every other field is left "
        "alone, and re-running is safe (already-assigned items land in `unchanged`). "
        "Pass `dry_run=true` to preview. The response carries per-item results, each "
        "item's `previous_module_id` (how to roll back) and a `correlation_id`."
    )
)
async def bulk_assign_work_items_to_module(
    project: str,
    module_id: str,
    codes: list[str],
    dry_run: bool = False,
) -> TPayload:
    return await _bulk_module(project, module_id, codes, dry_run)


@mcp.tool(
    description=(
        "Remove the module assignment from many work items in one request. Same "
        "response shape as bulk_assign_work_items_to_module, including per-item "
        "`previous_module_id` and a `correlation_id`."
    )
)
async def bulk_remove_work_items_from_module(
    project: str,
    codes: list[str],
    dry_run: bool = False,
) -> TPayload:
    return await _bulk_module(project, None, codes, dry_run)


async def _bulk_module(
    project: str, module_id: str | None, codes: list[str], dry_run: bool
) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(
        await api(
            "POST",
            f"/workspaces/{slug}/projects/{pid}/modules/bulk-assign/",
            {"codes": codes, "module_id": module_id, "dry_run": dry_run},
        )
    )


# ---- Project control plane (GIN-382) ---------------------------------------
# Planning structure (cycles, milestones, releases), relations, activity, forecast
# and bulk work-item edits — what an agent needs to run a project rather than one
# work item. Everything here rides the same project authorization as the REST API.


@mcp.tool(
    description=(
        "Create a cycle (sprint) in a project. Dates are YYYY-MM-DD. Returns the "
        "cycle including its `id`, which bulk_assign_work_items_to_cycle takes."
    )
)
async def create_cycle(
    project: str,
    name: str,
    description: str = "",
    start_date: str | None = None,
    end_date: str | None = None,
) -> TPayload:
    slug, pid = await resolve_ctx(project)
    payload = {k: v for k, v in {
        "name": name, "description": description,
        "start_date": start_date, "end_date": end_date,
    }.items() if v is not None}
    return text(await api("POST", f"/workspaces/{slug}/projects/{pid}/cycles/", payload))


@mcp.tool(description="Fetch one cycle with its work-item counts.")
async def get_cycle(project: str, cycle_id: str) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(await api("GET", f"/workspaces/{slug}/projects/{pid}/cycles/{cycle_id}/"))


@mcp.tool(
    description=(
        "Cycle burn-down/progress: scope, completed, remaining and pace. Use this "
        "rather than counting work items yourself."
    )
)
async def get_cycle_progress(project: str, cycle_id: str) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(
        await api("GET", f"/workspaces/{slug}/projects/{pid}/cycles/{cycle_id}/progress/")
    )


@mcp.tool(description="List the work items in a cycle.")
async def list_cycle_work_items(project: str, cycle_id: str) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(
        await api("GET", f"/workspaces/{slug}/projects/{pid}/cycles/{cycle_id}/stories/")
    )


@mcp.tool(
    description=(
        "Update a cycle's name, description, dates or status. `status` is one of "
        "draft/active/completed — set it to 'active' to start the cycle and "
        "'completed' to close it. Only the fields you pass change."
    )
)
async def update_cycle(
    project: str,
    cycle_id: str,
    name: str | None = None,
    description: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    status: str | None = None,
) -> TPayload:
    slug, pid = await resolve_ctx(project)
    patch = {k: v for k, v in {
        "name": name, "description": description, "start_date": start_date,
        "end_date": end_date, "status": status,
    }.items() if v is not None}
    return text(
        await api("PATCH", f"/workspaces/{slug}/projects/{pid}/cycles/{cycle_id}/", patch)
    )


@mcp.tool(
    description=(
        "Delete a cycle. Its work items are not deleted — they lose the cycle "
        "assignment and return to the backlog."
    )
)
async def delete_cycle(project: str, cycle_id: str) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(await api("DELETE", f"/workspaces/{slug}/projects/{pid}/cycles/{cycle_id}/"))


@mcp.tool(description="List the project's milestones, each with its progress rollup.")
async def list_milestones(project: str) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(await api("GET", f"/workspaces/{slug}/projects/{pid}/milestones/"))


@mcp.tool(
    description=(
        "Create an outcome milestone. `status` is planned/in_progress/done, "
        "`target_date` is YYYY-MM-DD, `initiative_id` links it to a workspace initiative."
    )
)
async def create_milestone(
    project: str,
    name: str,
    description: str = "",
    status: str | None = None,
    target_date: str | None = None,
    initiative_id: str | None = None,
) -> TPayload:
    slug, pid = await resolve_ctx(project)
    payload = {k: v for k, v in {
        "name": name, "description": description, "status": status,
        "target_date": target_date, "initiative_id": initiative_id,
    }.items() if v is not None}
    return text(await api("POST", f"/workspaces/{slug}/projects/{pid}/milestones/", payload))


@mcp.tool(description="Update a milestone's name, description, status, target date or initiative.")
async def update_milestone(
    project: str,
    milestone_id: str,
    name: str | None = None,
    description: str | None = None,
    status: str | None = None,
    target_date: str | None = None,
    initiative_id: str | None = None,
) -> TPayload:
    slug, pid = await resolve_ctx(project)
    patch = {k: v for k, v in {
        "name": name, "description": description, "status": status,
        "target_date": target_date, "initiative_id": initiative_id,
    }.items() if v is not None}
    return text(
        await api("PATCH", f"/workspaces/{slug}/projects/{pid}/milestones/{milestone_id}/", patch)
    )


@mcp.tool(description="Delete a milestone. Its work items keep their other fields.")
async def delete_milestone(project: str, milestone_id: str) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(
        await api("DELETE", f"/workspaces/{slug}/projects/{pid}/milestones/{milestone_id}/")
    )


@mcp.tool(
    description=(
        "Link work items to a milestone. Takes work-item codes (e.g. ['GIN-12']); "
        "unresolvable codes are reported and the rest still link."
    )
)
async def link_work_items_to_milestone(project: str, milestone_id: str, codes: list[str]) -> TPayload:
    slug, pid = await resolve_ctx(project)
    ids, failed = await _codes_to_ids(slug, codes)
    result = await api(
        "POST", f"/workspaces/{slug}/projects/{pid}/milestones/{milestone_id}/link/",
        {"story_ids": ids},
    )
    return text({"milestone": result, "linked": len(ids), "failed": failed})


@mcp.tool(description="List the project's releases.")
async def list_releases(project: str) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(await api("GET", f"/workspaces/{slug}/projects/{pid}/releases/"))


@mcp.tool(description="Create a release (version + optional name).")
async def create_release(project: str, version: str, name: str = "") -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(
        await api(
            "POST", f"/workspaces/{slug}/projects/{pid}/releases/",
            {"version": version, "name": name},
        )
    )


@mcp.tool(
    description=(
        "Update a release's version, name, changelog or status "
        "(unreleased/released — setting 'released' stamps the release date)."
    )
)
async def update_release(
    project: str,
    release_id: str,
    version: str | None = None,
    name: str | None = None,
    changelog_md: str | None = None,
    status: str | None = None,
) -> TPayload:
    slug, pid = await resolve_ctx(project)
    patch = {k: v for k, v in {
        "version": version, "name": name, "changelog_md": changelog_md, "status": status,
    }.items() if v is not None}
    return text(
        await api("PATCH", f"/workspaces/{slug}/projects/{pid}/releases/{release_id}/", patch)
    )


@mcp.tool(description="Link work items (by code) to a release.")
async def link_work_items_to_release(project: str, release_id: str, codes: list[str]) -> TPayload:
    slug, pid = await resolve_ctx(project)
    ids, failed = await _codes_to_ids(slug, codes)
    result = await api(
        "POST", f"/workspaces/{slug}/projects/{pid}/releases/{release_id}/link/",
        {"story_ids": ids},
    )
    return text({"release": result, "linked": len(ids), "failed": failed})


@mcp.tool(
    description=(
        "The project's whole planning structure in one call: modules, cycles, "
        "milestones and releases with their work-item counts. Start here when "
        "reorganizing a project you have not seen before."
    )
)
async def list_project_structure(project: str) -> TPayload:
    slug, pid = await resolve_ctx(project)
    base = f"/workspaces/{slug}/projects/{pid}"
    modules, cycles, milestones, releases = await asyncio.gather(
        api("GET", f"{base}/modules/"),
        api("GET", f"{base}/cycles/"),
        api("GET", f"{base}/milestones/"),
        api("GET", f"{base}/releases/"),
    )
    return text({
        "modules": [
            {"id": m["id"], "name": m["name"], "status": m["status"],
             "story_count": m["story_count"], "completed_story_count": m["completed_story_count"]}
            for m in modules
        ],
        "cycles": [
            {"id": c["id"], "name": c["name"], "status": c["status"],
             "start_date": c.get("start_date"), "end_date": c.get("end_date"),
             "story_count": c["story_count"], "completed_story_count": c["completed_story_count"]}
            for c in cycles
        ],
        "milestones": [
            {"id": m["id"], "name": m["name"], "status": m["status"],
             "target_date": m.get("target_date"), "rollup": m.get("rollup")}
            for m in milestones
        ],
        "releases": [
            {"id": r["id"], "version": r["version"], "name": r.get("name"),
             "status": r["status"]}
            for r in releases
        ],
    })


async def _codes_to_ids(slug: str, codes: list[str]) -> tuple[list[str], list[dict]]:
    """Resolve work-item codes to ids, reporting the ones that don't resolve rather
    than failing the whole call."""
    ids: list[str] = []
    failed: list[dict] = []
    for code in codes[:MAX_BULK_CODES]:
        try:
            ids.append((await _resolve_story(slug, code))["id"])
        except ApiError as err:
            failed.append({"code": code, "error": str(err)})
    if len(codes) > MAX_BULK_CODES:
        failed += [{"code": c, "error": "over_batch_limit"} for c in codes[MAX_BULK_CODES:]]
    return ids, failed


@mcp.tool(
    description=(
        "Change fields on many work items in one request. `changes` is an object of "
        "the fields to set — any of status, priority, type, assignee_id, label_id, "
        "cycle_id, module_id, start_date, target_date (YYYY-MM-DD), e.g. "
        "{'status': 'in_progress', 'assignee_id': '…'}. Only those fields are "
        "written — everything else on "
        "each item is left alone. Pass `dry_run=true` to preview. The response "
        "gives per-item `previous`/`proposed` values (that is the rollback data), "
        "`unchanged` items, `failed` items (bad_code / cross_project / not_found / "
        "bmad_locked / gate_blocked) and a `correlation_id`. Locked Sprint-0 cards "
        "and workflow gates are enforced here exactly as in the UI."
    )
)
async def bulk_update_work_items(
    project: str, codes: list[str], changes: dict, dry_run: bool = False
) -> TPayload:
    return await _bulk_update(project, codes, changes, dry_run)


@mcp.tool(
    description=(
        "Put many work items into a cycle (sprint) in one request. Same response "
        "shape as bulk_update_work_items."
    )
)
async def bulk_assign_work_items_to_cycle(
    project: str, cycle_id: str, codes: list[str], dry_run: bool = False
) -> TPayload:
    return await _bulk_update(project, codes, {"cycle_id": cycle_id}, dry_run)


@mcp.tool(
    description=(
        "Assign many work items to one owner. The assignee must be an active member "
        "of the project. Same response shape as bulk_update_work_items."
    )
)
async def bulk_assign_work_items_to_owner(
    project: str, assignee_id: str, codes: list[str], dry_run: bool = False
) -> TPayload:
    return await _bulk_update(project, codes, {"assignee_id": assignee_id}, dry_run)


@mcp.tool(
    description=(
        "Move many work items to one status. Items blocked by a BMAD lock or a "
        "workflow gate come back under `failed` — the rest still move."
    )
)
async def bulk_change_work_item_status(
    project: str, status: str, codes: list[str], dry_run: bool = False
) -> TPayload:
    return await _bulk_update(project, codes, {"status": status}, dry_run)


@mcp.tool(
    description=(
        "Set start_date and/or target_date (YYYY-MM-DD) on many work items at once."
    )
)
async def bulk_set_work_item_dates(
    project: str,
    codes: list[str],
    start_date: str | None = None,
    target_date: str | None = None,
    dry_run: bool = False,
) -> TPayload:
    changes = {k: v for k, v in {
        "start_date": start_date, "target_date": target_date,
    }.items() if v is not None}
    return await _bulk_update(project, codes, changes, dry_run)


async def _bulk_update(
    project: str, codes: list[str], changes: dict, dry_run: bool
) -> TPayload:
    if not changes:
        raise ApiError(400, "Pass at least one field to change.")
    slug, pid = await resolve_ctx(project)
    return text(
        await api(
            "POST",
            f"/workspaces/{slug}/projects/{pid}/stories/bulk-update/",
            {"codes": codes, "changes": changes, "dry_run": dry_run},
        )
    )


@mcp.tool(description="List a work item's relations (blocking, blocked-by, duplicate, relates-to).")
async def list_work_item_relations(code: str) -> TPayload:
    slug = await default_workspace()
    story = await _resolve_story(slug, code)
    return text(
        await api(
            "GET",
            f"/workspaces/{slug}/projects/{story['project_id']}/stories/{story['id']}/relations/",
        )
    )


@mcp.tool(
    description=(
        "Relate two work items by code. `relation_type` is one of blocking "
        "(this item blocks the other), blocked_by, duplicate, relates_to. Both items "
        "must be in the same project. A duplicate relation, a self-relation, or one "
        "that would close a circular blocking chain is rejected."
    )
)
async def create_work_item_relation(code: str, related_code: str, relation_type: str) -> TPayload:
    slug = await default_workspace()
    story = await _resolve_story(slug, code)
    related = await _resolve_story(slug, related_code)
    return text(
        await api(
            "POST",
            f"/workspaces/{slug}/projects/{story['project_id']}/stories/{story['id']}/relations/",
            {"relation_type": relation_type, "related_story_id": related["id"]},
        )
    )


@mcp.tool(description="Delete a relation by its id (from list_work_item_relations).")
async def delete_work_item_relation(code: str, relation_id: str) -> TPayload:
    slug = await default_workspace()
    story = await _resolve_story(slug, code)
    return text(
        await api(
            "DELETE",
            f"/workspaces/{slug}/projects/{story['project_id']}"
            f"/stories/{story['id']}/relations/{relation_id}/",
        )
    )


@mcp.tool(
    description=(
        "Create many relations in one call. `relations` is a list of "
        "{code, related_code, relation_type}. Each is validated independently — a "
        "rejected one (duplicate, self-relation, circular blocking) is reported and "
        "the rest are still created."
    )
)
async def bulk_create_work_item_relations(relations: list[dict]) -> TPayload:
    created, failed = [], []
    for spec in relations[:MAX_BULK_CODES]:
        try:
            created.append(
                await create_work_item_relation(
                    spec["code"], spec["related_code"], spec["relation_type"]
                )
            )
        except (ApiError, KeyError) as err:
            failed.append({"relation": spec, "error": str(err)})
    if len(relations) > MAX_BULK_CODES:
        failed += [
            {"relation": r, "error": "over_batch_limit"} for r in relations[MAX_BULK_CODES:]
        ]
    return text({
        "created": created,
        "failed": failed,
        "counts": {"created": len(created), "failed": len(failed)},
    })


@mcp.tool(description="A work item's change history (who changed what, when).")
async def get_work_item_history(code: str) -> TPayload:
    slug = await default_workspace()
    story = await _resolve_story(slug, code)
    return text(
        await api(
            "GET",
            f"/workspaces/{slug}/projects/{story['project_id']}/stories/{story['id']}/history/",
        )
    )


@mcp.tool(
    description=(
        "The project's activity feed, most recent first. `limit` caps the response "
        "(default 50) — the feed is unbounded server-side, so ask for what you need."
    )
)
async def list_project_activity(project: str, limit: int = 50) -> TPayload:
    slug, pid = await resolve_ctx(project)
    rows = await api("GET", f"/workspaces/{slug}/projects/{pid}/activity/")
    limit = max(1, min(limit, MAX_PAGE))
    return text(_collection(rows, cap=limit))


@mcp.tool(
    description=(
        "The project's delivery forecast: throughput-based completion dates (P50/P85/"
        "P95) plus the health assessment and the reasons behind it. Read-only — it "
        "explains the current state, it does not change anything."
    )
)
async def get_project_forecast(project: str) -> TPayload:
    slug, pid = await resolve_ctx(project)
    base = f"/workspaces/{slug}/projects/{pid}/forecasting"
    forecast, health = await asyncio.gather(
        api("GET", f"{base}/completion/"), api("GET", f"{base}/health/")
    )
    return text({"forecast": forecast, "health": health})


@mcp.tool(
    description=(
        "Check whether a work item's required skills are evidenced on its latest "
        "agent run before you move it to Done. Advisory today: it reports the gap, "
        "it does not block the transition — do not mark an item Done autonomously "
        "when this reports unmet requirements."
    )
)
async def validate_done_transition(code: str) -> TPayload:
    slug = await default_workspace()
    story = await _resolve_story(slug, code)
    return text(
        await api(
            "GET",
            f"/workspaces/{slug}/projects/{story['project_id']}"
            f"/stories/{story['id']}/completion-gate/",
        )
    )


# ---- Backlog readiness (GIN-384) -------------------------------------------
# Diagnosis, never rewriting: these report what is wrong with a work item and
# what a human would have to decide. Applying a fix is a separate, explicit call
# to update_work_item / bulk_update_work_items.


@mcp.tool(
    description=(
        "Grade a whole project's backlog: every work item gets a readiness "
        "classification (draft / needs_clarification / ready / blocked / "
        "in_progress_valid / in_review_valid / completion_unverified / "
        "duplicate_candidate / obsolete_candidate), a 0-100 score, and the rules it "
        "failed with a severity, a confidence and a recommended action. Worst items "
        "first. Filter with `readiness` (comma-separated) and page with limit/offset; "
        "`by_readiness` tallies the whole project even when you page. Read-only — it "
        "diagnoses, it never edits anything."
    )
)
async def audit_project_work_items(
    project: str, readiness: str | None = None, limit: int = 50, offset: int = 0
) -> TPayload:
    slug, pid = await resolve_ctx(project)
    path = _with_query(
        f"/workspaces/{slug}/projects/{pid}/readiness-audit/",
        readiness=readiness, limit=limit, offset=offset,
    )
    return text(await api("GET", path))


@mcp.tool(
    description=(
        "One work item's readiness: its classification, the rules it failed, and "
        "`proposed_repairs` — a reviewable change set where `auto_applicable` marks "
        "the ones a machine can safely apply via update_work_item. Missing acceptance "
        "criteria are reported as work for a human, never invented."
    )
)
async def get_work_item_readiness(code: str) -> TPayload:
    slug = await default_workspace()
    story = await _resolve_story(slug, code)
    return text(
        await api(
            "GET",
            f"/workspaces/{slug}/projects/{story['project_id']}"
            f"/stories/{story['id']}/readiness/",
        )
    )


@mcp.tool(
    description=(
        "Work items in a project whose titles are near-identical, as candidate pairs "
        "with a similarity score. A title heuristic, not semantic matching: it "
        "surfaces pairs for a human to judge and merges nothing."
    )
)
async def detect_duplicate_work_items(project: str) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(await api("GET", f"/workspaces/{slug}/projects/{pid}/duplicate-work-items/"))


@mcp.tool(description="List workspace members.")
async def list_users() -> TPayload:
    slug = await default_workspace()
    return text(await api("GET", f"/workspaces/{slug}/members/"))


@mcp.tool(description="Fetch a user by id.")
async def get_user(user_id: str) -> TPayload:
    return text(await api("GET", f"/users/{user_id}/"))



# ---- Autonomy policy + action approvals (GIN-387) ---------------------------
# The boundary an autonomous project director works inside. Nothing here executes
# a change: it decides whether one may run unattended, and records the answer.


@mcp.tool(
    description=(
        "The project's autonomy policy: whether the director is paused, the "
        "per-run limits (max items, date shift, priority changes, reassignments), "
        "the allowed status transitions, the actions that always need human "
        "approval, and quiet hours. A project that never configured one gets "
        "conservative defaults — absent never means unlimited."
    )
)
async def get_project_autonomy_policy(project: str) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(await api("GET", f"/workspaces/{slug}/projects/{pid}/autonomy-policy/"))


@mcp.tool(
    description=(
        "Update the autonomy policy. Only the fields you pass change. "
        "`allowed_status_transitions` is a list of [from, to] pairs (omit for any); "
        "`restricted_actions` lists the actions that always need approval. Requires "
        "project MANAGE_SETTINGS — an agent cannot widen its own limits."
    )
)
async def update_project_autonomy_policy(
    project: str,
    max_items_per_run: int | None = None,
    max_date_shift_days: int | None = None,
    max_priority_changes: int | None = None,
    max_reassignments: int | None = None,
    allowed_status_transitions: list[list[str]] | None = None,
    restricted_actions: list[str] | None = None,
    quiet_hours_start: int | None = None,
    quiet_hours_end: int | None = None,
) -> TPayload:
    slug, pid = await resolve_ctx(project)
    patch = {k: v for k, v in {
        "max_items_per_run": max_items_per_run,
        "max_date_shift_days": max_date_shift_days,
        "max_priority_changes": max_priority_changes,
        "max_reassignments": max_reassignments,
        "allowed_status_transitions": allowed_status_transitions,
        "restricted_actions": restricted_actions,
        "quiet_hours_start": quiet_hours_start,
        "quiet_hours_end": quiet_hours_end,
    }.items() if v is not None}
    return text(
        await api("PATCH", f"/workspaces/{slug}/projects/{pid}/autonomy-policy/", patch)
    )


@mcp.tool(
    description=(
        "Ask the policy whether an action may run unattended, and record the answer. "
        "Returns `decision` (allowed / requires_approval / reasons) and the audited "
        "`action` row. Within policy it is auto-approved; outside it — or when the "
        "director is paused — it becomes a pending action for a human. Describe the "
        "size of the change (`item_count`, `date_shift_days`, `priority_changes`, "
        "`reassignments`, `status_transition`) so the limits can be applied honestly. "
        "Call this BEFORE making an autonomous change, not after."
    )
)
async def request_project_director_action(
    project: str,
    action: str,
    reason: str = "",
    payload: dict | None = None,
    item_count: int = 1,
    date_shift_days: int = 0,
    priority_changes: int = 0,
    reassignments: int = 0,
    status_transition: list[str] | None = None,
    correlation_id: str | None = None,
) -> TPayload:
    slug, pid = await resolve_ctx(project)
    body = {
        "action": action, "reason": reason, "payload": payload,
        "item_count": item_count, "date_shift_days": date_shift_days,
        "priority_changes": priority_changes, "reassignments": reassignments,
        "status_transition": status_transition, "correlation_id": correlation_id,
    }
    return text(
        await api("POST", f"/workspaces/{slug}/projects/{pid}/director-actions/", body)
    )


@mcp.tool(
    description=(
        "List director actions, newest first. Filter with `status` "
        "(pending / approved / rejected / auto_approved / executed / failed / "
        "rolled_back, comma-separated) — `status='pending'` is the human's queue."
    )
)
async def list_project_director_actions(
    project: str, status: str | None = None, limit: int = 50, offset: int = 0
) -> TPayload:
    slug, pid = await resolve_ctx(project)
    path = _with_query(
        f"/workspaces/{slug}/projects/{pid}/director-actions/",
        status_filter=status, limit=limit, offset=offset,
    )
    return text(await api("GET", path))


@mcp.tool(description="Fetch one director action with its full decision audit trail.")
async def get_project_director_action(project: str, action_id: str) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(
        await api("GET", f"/workspaces/{slug}/projects/{pid}/director-actions/{action_id}/")
    )


@mcp.tool(
    description=(
        "Approve a pending director action. Requires project MANAGE_SETTINGS, "
        "records who decided and when, and cannot be changed afterwards."
    )
)
async def approve_project_director_action(
    project: str, action_id: str, note: str = ""
) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(await api(
        "POST",
        f"/workspaces/{slug}/projects/{pid}/director-actions/{action_id}/approve/",
        {"note": note},
    ))


@mcp.tool(description="Reject a pending director action, with a note explaining why.")
async def reject_project_director_action(
    project: str, action_id: str, note: str = ""
) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(await api(
        "POST",
        f"/workspaces/{slug}/projects/{pid}/director-actions/{action_id}/reject/",
        {"note": note},
    ))


@mcp.tool(
    description=(
        "Emergency stop: pause the project director. Every later action request is "
        "refused (allowed=false) until someone resumes it; reads keep working."
    )
)
async def pause_project_director(project: str, reason: str = "") -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(await api(
        "POST", f"/workspaces/{slug}/projects/{pid}/autonomy-policy/pause/", {"reason": reason}
    ))


@mcp.tool(description="Resume a paused project director.")
async def resume_project_director(project: str) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(
        await api("POST", f"/workspaces/{slug}/projects/{pid}/autonomy-policy/resume/", {})
    )


# ---- Blockers (GIN-383) -----------------------------------------------------
# Why work is stopped, who owns clearing it, and how long it has been that way —
# including the external dependencies a work-item relation cannot express.


@mcp.tool(
    description=(
        "Mark a work item blocked and record why. Name the blocking work item with "
        "`blocking_code`, or describe an `external_dependency` (a vendor, an access "
        "request, a decision) — one of the two is required. `impact` is "
        "low/medium/high/critical. This is distinct from a blocking *relation*: it "
        "carries the reason, an owner, an expected resolution date and an escalation "
        "level, so blocked work stops reading as ordinary Todo."
    )
)
async def mark_work_item_blocked(
    code: str,
    reason: str,
    blocking_code: str | None = None,
    external_dependency: str = "",
    impact: str = "medium",
    owner_id: str | None = None,
    expected_resolution_date: str | None = None,
) -> TPayload:
    slug = await default_workspace()
    story = await _resolve_story(slug, code)
    body = {
        "reason": reason, "blocking_code": blocking_code,
        "external_dependency": external_dependency, "impact": impact,
        "owner_id": owner_id, "expected_resolution_date": expected_resolution_date,
    }
    return text(await api(
        "POST",
        f"/workspaces/{slug}/projects/{story['project_id']}/stories/{story['id']}/blockers/",
        body,
    ))


@mcp.tool(
    description=(
        "The project's blockers, oldest first — age is the point of this list. "
        "Returns counts of open / overdue (past their expected resolution date) / "
        "escalated. Defaults to open only; pass `status` "
        "(open,resolved,cancelled) for the rest."
    )
)
async def list_project_blockers(project: str, status: str | None = None) -> TPayload:
    slug, pid = await resolve_ctx(project)
    path = _with_query(f"/workspaces/{slug}/projects/{pid}/blockers/", status_filter=status)
    return text(await api("GET", path))


@mcp.tool(description="List one work item's blockers (open only unless include_resolved).")
async def list_work_item_blockers(code: str, include_resolved: bool = False) -> TPayload:
    slug = await default_workspace()
    story = await _resolve_story(slug, code)
    path = _with_query(
        f"/workspaces/{slug}/projects/{story['project_id']}/stories/{story['id']}/blockers/",
        include_resolved=str(include_resolved).lower(),
    )
    return text(await api("GET", path))


@mcp.tool(
    description=(
        "Update a blocker's reason, impact, owner, expected resolution date or "
        "external dependency. Only the fields you pass change."
    )
)
async def update_blocker(
    project: str,
    blocker_id: str,
    reason: str | None = None,
    impact: str | None = None,
    owner_id: str | None = None,
    expected_resolution_date: str | None = None,
    external_dependency: str | None = None,
) -> TPayload:
    slug, pid = await resolve_ctx(project)
    patch = {k: v for k, v in {
        "reason": reason, "impact": impact, "owner_id": owner_id,
        "expected_resolution_date": expected_resolution_date,
        "external_dependency": external_dependency,
    }.items() if v is not None}
    return text(
        await api("PATCH", f"/workspaces/{slug}/projects/{pid}/blockers/{blocker_id}/", patch)
    )


@mcp.tool(
    description=(
        "Clear a blocker. Pass `resolution_evidence` (a PR, a ticket, an approval) "
        "for how you know it is actually clear. Use `cancelled=true` when it turned "
        "out not to be blocking — that is recorded as cancelled, not resolved, "
        "rather than pretending an impediment was overcome."
    )
)
async def resolve_blocker(
    project: str, blocker_id: str, resolution_evidence: str = "", cancelled: bool = False
) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(await api(
        "POST", f"/workspaces/{slug}/projects/{pid}/blockers/{blocker_id}/resolve/",
        {"resolution_evidence": resolution_evidence, "cancelled": cancelled},
    ))


@mcp.tool(
    description=(
        "Raise a blocker's escalation level: none -> team -> project -> sponsor -> "
        "external. Escalation only moves up; a request to lower it is rejected."
    )
)
async def escalate_blocker(
    project: str, blocker_id: str, level: str, note: str = ""
) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(await api(
        "POST", f"/workspaces/{slug}/projects/{pid}/blockers/{blocker_id}/escalate/",
        {"level": level, "note": note},
    ))


# ---- Risks, decisions, escalations (GIN-386) --------------------------------
# The three things a project manager tracks that are not work items. Records with
# an owner and a due date, so they can be queried and chased instead of going
# stale in a status update nobody re-reads.


@mcp.tool(
    description=(
        "Record a project risk. `probability` and `impact` are 1-5; exposure "
        "(probability x impact) is stored so a historical report means what it said "
        "at the time. `trigger` is the observable signal that it is materializing; "
        "`category` is delivery/technical/resource/external/security/compliance/"
        "budget/scope. `response_plan` groups the qualitative fields: "
        "{mitigation, contingency, trigger}."
    )
)
async def create_project_risk(
    project: str,
    title: str,
    description: str = "",
    category: str = "delivery",
    probability: int = 3,
    impact: int = 3,
    owner_id: str | None = None,
    due_date: str | None = None,
    response_plan: dict | None = None,
    affected_work_item_codes: list[str] | None = None,
) -> TPayload:
    slug, pid = await resolve_ctx(project)
    plan = response_plan or {}
    body = {
        "title": title, "description": description, "category": category,
        "probability": probability, "impact": impact, "owner_id": owner_id,
        "mitigation": plan.get("mitigation", ""), "contingency": plan.get("contingency", ""),
        "trigger": plan.get("trigger", ""),
        "due_date": due_date, "affected_work_item_codes": affected_work_item_codes,
    }
    return text(await api("POST", f"/workspaces/{slug}/projects/{pid}/risks/", body))


@mcp.tool(
    description=(
        "The project's risk register, highest exposure first, with counts of open "
        "and overdue. Pass `status` (open,mitigating,closed,occurred) to widen it."
    )
)
async def list_project_risks(project: str, status: str | None = None) -> TPayload:
    slug, pid = await resolve_ctx(project)
    path = _with_query(f"/workspaces/{slug}/projects/{pid}/risks/", status_filter=status)
    return text(await api("GET", path))


@mcp.tool(description="Fetch one risk.")
async def get_project_risk(project: str, risk_id: str) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(await api("GET", f"/workspaces/{slug}/projects/{pid}/risks/{risk_id}/"))


@mcp.tool(
    description=(
        "Update a risk. Changing probability or impact recomputes the stored "
        "exposure. Set `status` to 'mitigating' when work against it starts. "
        "`response_plan` takes any of {mitigation, contingency, trigger}."
    )
)
async def update_project_risk(
    project: str,
    risk_id: str,
    title: str | None = None,
    description: str | None = None,
    status: str | None = None,
    probability: int | None = None,
    impact: int | None = None,
    owner_id: str | None = None,
    due_date: str | None = None,
    response_plan: dict | None = None,
) -> TPayload:
    slug, pid = await resolve_ctx(project)
    patch = {k: v for k, v in {
        "title": title, "description": description, "status": status,
        "probability": probability, "impact": impact, "owner_id": owner_id,
        "due_date": due_date, **(response_plan or {}),
    }.items() if v is not None}
    return text(await api("PATCH", f"/workspaces/{slug}/projects/{pid}/risks/{risk_id}/", patch))


@mcp.tool(
    description=(
        "Close a risk with a note. Pass `occurred=true` when it actually happened — "
        "a register where materialized risks look the same as avoided ones teaches "
        "nothing next time."
    )
)
async def close_project_risk(
    project: str, risk_id: str, note: str = "", occurred: bool = False
) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(await api(
        "POST", f"/workspaces/{slug}/projects/{pid}/risks/{risk_id}/close/",
        {"note": note, "occurred": occurred},
    ))


@mcp.tool(
    description=(
        "Record a decision someone has to make. `options` is a list of "
        "{key, summary, pros, cons}; `recommended_option` is one of their keys. "
        "`impact_of_delay` is the field that actually gets decisions made — say what "
        "it costs to keep not deciding."
    )
)
async def create_project_decision(
    project: str,
    question: str,
    context: str = "",
    options: list[dict] | None = None,
    recommended_option: str | None = None,
    rationale: str = "",
    evidence: str = "",
    impact_of_delay: str = "",
    owner_id: str | None = None,
    due_date: str | None = None,
) -> TPayload:
    slug, pid = await resolve_ctx(project)
    body = {
        "question": question, "context": context, "options": options,
        "recommended_option": recommended_option, "rationale": rationale,
        "evidence": evidence, "impact_of_delay": impact_of_delay,
        "owner_id": owner_id, "due_date": due_date,
    }
    return text(await api("POST", f"/workspaces/{slug}/projects/{pid}/decisions/", body))


@mcp.tool(
    description=(
        "Open decisions, soonest due first (overdue ones lead). Pass `status` "
        "(open,resolved,deferred) to widen it."
    )
)
async def list_open_project_decisions(project: str, status: str | None = None) -> TPayload:
    slug, pid = await resolve_ctx(project)
    path = _with_query(f"/workspaces/{slug}/projects/{pid}/decisions/", status_filter=status)
    return text(await api("GET", path))


@mcp.tool(description="Fetch one decision.")
async def get_project_decision(project: str, decision_id: str) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(await api("GET", f"/workspaces/{slug}/projects/{pid}/decisions/{decision_id}/"))


@mcp.tool(
    description=(
        "Record the answer to a decision: who chose what, when. `selected_option` "
        "must be one of the option keys that were written down — a decision resolved "
        "to something nobody recorded is a memory, not a record."
    )
)
async def resolve_project_decision(
    project: str, decision_id: str, selected_option: str, note: str = ""
) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(await api(
        "POST", f"/workspaces/{slug}/projects/{pid}/decisions/{decision_id}/resolve/",
        {"selected_option": selected_option, "note": note},
    ))


@mcp.tool(
    description=(
        "Raise an escalation — something the team cannot resolve at its own level. "
        "`category` is access/vendor/approval/security/budget/scope/staffing/"
        "external_dependency; `raised_to` names who is being asked to act (often "
        "someone with no account here); `blocker_id` links the blocker it exists to "
        "clear."
    )
)
async def create_project_escalation(
    project: str,
    title: str,
    category: str,
    description: str = "",
    raised_to: str = "",
    needed_by: str | None = None,
    blocker_id: str | None = None,
) -> TPayload:
    slug, pid = await resolve_ctx(project)
    body = {
        "title": title, "category": category, "description": description,
        "raised_to": raised_to, "needed_by": needed_by, "blocker_id": blocker_id,
    }
    return text(await api("POST", f"/workspaces/{slug}/projects/{pid}/escalations/", body))


@mcp.tool(
    description=(
        "Open escalations, oldest first, with counts of overdue and unacknowledged. "
        "Pass `status` (open,acknowledged,resolved) to widen it."
    )
)
async def list_open_project_escalations(project: str, status: str | None = None) -> TPayload:
    slug, pid = await resolve_ctx(project)
    path = _with_query(f"/workspaces/{slug}/projects/{pid}/escalations/", status_filter=status)
    return text(await api("GET", path))


@mcp.tool(
    description=(
        "Update an escalation. Setting `status='acknowledged'` stamps the time it "
        "was acknowledged, so the wait for a response is measurable."
    )
)
async def update_project_escalation(
    project: str,
    escalation_id: str,
    title: str | None = None,
    description: str | None = None,
    status: str | None = None,
    raised_to: str | None = None,
    needed_by: str | None = None,
) -> TPayload:
    slug, pid = await resolve_ctx(project)
    patch = {k: v for k, v in {
        "title": title, "description": description, "status": status,
        "raised_to": raised_to, "needed_by": needed_by,
    }.items() if v is not None}
    return text(await api(
        "PATCH", f"/workspaces/{slug}/projects/{pid}/escalations/{escalation_id}/", patch
    ))


@mcp.tool(description="Resolve an escalation, recording what the resolution was.")
async def resolve_project_escalation(
    project: str, escalation_id: str, resolution: str = ""
) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(await api(
        "POST", f"/workspaces/{slug}/projects/{pid}/escalations/{escalation_id}/resolve/",
        {"resolution": resolution},
    ))


# ---- Recovery plans (GIN-385) -----------------------------------------------
# A reviewable change set, not a document. Creating one changes nothing; only the
# approved changes are applied, and each records the value it replaced so the
# whole thing can be undone.


@mcp.tool(
    description=(
        "Propose a recovery plan: a reviewable set of work-item changes that is "
        "stored, not applied. Each change is {code, field, proposed_value, reason, "
        "evidence, confidence}; fields are limited to status, priority, type, "
        "assignee_id, label_id, cycle_id, module_id, start_date, target_date. "
        "Pass `from_readiness_audit=true` to seed it with the repairs the audit "
        "considers safe for a machine — judgement calls are never seeded, because a "
        "plan must not invent requirements. Creating a plan writes nothing to the "
        "project."
    )
)
async def create_project_recovery_plan(
    project: str,
    title: str,
    summary: str = "",
    changes: list[dict] | None = None,
    from_readiness_audit: bool = False,
) -> TPayload:
    slug, pid = await resolve_ctx(project)
    body = {
        "title": title, "summary": summary, "changes": changes or [],
        "from_readiness_audit": from_readiness_audit,
    }
    return text(await api("POST", f"/workspaces/{slug}/projects/{pid}/recovery-plans/", body))


@mcp.tool(description="List the project's recovery plans, newest first, with per-status counts.")
async def list_project_recovery_plans(project: str) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(await api("GET", f"/workspaces/{slug}/projects/{pid}/recovery-plans/"))


@mcp.tool(
    description=(
        "Fetch a recovery plan with every change: current value, proposed value, "
        "reason, evidence, confidence and status. This is the preview — read it "
        "before approving anything."
    )
)
async def get_project_recovery_plan(project: str, plan_id: str) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(
        await api("GET", f"/workspaces/{slug}/projects/{pid}/recovery-plans/{plan_id}/")
    )


@mcp.tool(
    description=(
        "Approve changes in a plan. Pass `change_ids` to approve only some — partial "
        "approval is the normal case, and the reason a plan is a change set rather "
        "than a document. Omit it to approve everything still proposed."
    )
)
async def approve_project_recovery_plan(
    project: str, plan_id: str, change_ids: list[str] | None = None, note: str = ""
) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(await api(
        "POST", f"/workspaces/{slug}/projects/{pid}/recovery-plans/{plan_id}/approve/",
        {"change_ids": change_ids, "note": note},
    ))


@mcp.tool(description="Reject changes in a plan (all of them, or just `change_ids`).")
async def reject_project_recovery_plan(
    project: str, plan_id: str, change_ids: list[str] | None = None, note: str = ""
) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(await api(
        "POST", f"/workspaces/{slug}/projects/{pid}/recovery-plans/{plan_id}/reject/",
        {"change_ids": change_ids, "note": note},
    ))


@mcp.tool(
    description=(
        "Apply only the approved changes. Each stores the value it replaced, so the "
        "plan can be rolled back; a change that fails is recorded as failed and does "
        "not stop the rest. Refused with `director_paused` while the project "
        "director is paused, however well-approved the plan is."
    )
)
async def apply_project_recovery_plan(project: str, plan_id: str) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(await api(
        "POST", f"/workspaces/{slug}/projects/{pid}/recovery-plans/{plan_id}/apply/", {}
    ))


@mcp.tool(
    description=(
        "Restore every applied change to the value it replaced. Changes that were "
        "never applied are left alone — rollback undoes what happened, not what was "
        "merely proposed."
    )
)
async def rollback_project_recovery_plan(project: str, plan_id: str) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(await api(
        "POST", f"/workspaces/{slug}/projects/{pid}/recovery-plans/{plan_id}/rollback/", {}
    ))


# ---- Daily control run + change feed (GIN-388) ------------------------------
# The loop: observe what changed, compare against the records, propose. It never
# applies anything — proposals become a recovery plan a human approves.


@mcp.tool(
    description=(
        "Run one project control cycle and persist it: readiness, blocked work, "
        "overdue blockers/decisions/escalations, stale in-flight items, plus the "
        "actions it would take. Every finding names the work items or records "
        "behind it, and every proposed action carries the autonomy policy's verdict "
        "(`actions_within_policy` could run unattended; `actions_awaiting_approval` "
        "needs a human). **Nothing is applied** — feed the proposals into a recovery "
        "plan. The run is deterministic analysis over existing records, so `model` "
        "is null: a run that never asked a model must not look like one that did."
    )
)
async def run_project_control_cycle(project: str) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(await api("POST", f"/workspaces/{slug}/projects/{pid}/control-runs/", {}))


@mcp.tool(description="List past control runs, newest first.")
async def list_project_control_runs(project: str, limit: int = 20) -> TPayload:
    slug, pid = await resolve_ctx(project)
    path = _with_query(f"/workspaces/{slug}/projects/{pid}/control-runs/", limit=limit)
    return text(await api("GET", path))


@mcp.tool(description="Fetch one control run with its findings, actions and forecast.")
async def get_project_control_run(project: str, run_id: str) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(
        await api("GET", f"/workspaces/{slug}/projects/{pid}/control-runs/{run_id}/")
    )


@mcp.tool(
    description=(
        "Project activity since a timestamp (ISO 8601), with a `cursor` to resume "
        "from next time — so a daily run does not re-read the whole project every "
        "morning. The cursor stays where it was when nothing came back, so you never "
        "advance past events you have not seen."
    )
)
async def get_project_changes_since(
    project: str, since: str | None = None, limit: int = 100
) -> TPayload:
    slug, pid = await resolve_ctx(project)
    path = _with_query(f"/workspaces/{slug}/projects/{pid}/changes/", since=since, limit=limit)
    return text(await api("GET", path))


@mcp.tool(
    description=(
        "In-flight work that has not moved in `days` (default 14), oldest first. "
        "Stale *in flight* is the signal — an untouched backlog item is just a "
        "backlog item."
    )
)
async def list_stale_work_items(project: str, days: int = 14) -> TPayload:
    slug, pid = await resolve_ctx(project)
    path = _with_query(f"/workspaces/{slug}/projects/{pid}/stale-work-items/", days=days)
    return text(await api("GET", path))


@mcp.tool(
    description=(
        "Today's plan grouped by owner: what each person has in flight, which of it "
        "is blocked, and how long since each item moved. Grouped by owner rather "
        "than status, because that is how a standup reads."
    )
)
async def generate_team_today_plan(project: str) -> TPayload:
    slug, pid = await resolve_ctx(project)
    return text(await api("GET", f"/workspaces/{slug}/projects/{pid}/today-plan/"))
