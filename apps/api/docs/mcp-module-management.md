# MCP module management (GIN-380)

Modules are a project's workstreams. These tools let an agent reorganize an
existing project without the UI. Every call runs as the PAT's user and obeys the
same workspace/project roles as the REST API (a project Viewer gets 403).

`project` is `"workspace_slug/project_id"` or a bare project id in the active
workspace.

## Tools

| Tool | Purpose |
| --- | --- |
| `list_modules(project)` | The project's modules with work-item counts |
| `create_module(project, name, description?, status?, lead_id?, start_date?, target_date?, color?)` | Create one, returns the module incl. `id` |
| `get_module(project, module_id)` | One module |
| `update_module(project, module_id, name?, description?, status?, lead_id?, start_date?, target_date?, color?)` | Patch the fields you pass |
| `delete_module(project, module_id, on_work_items?, move_to_module_id?)` | Delete with an explicit strategy for its items |
| `list_module_work_items(project, module_id)` | The items in a module |
| `bulk_assign_work_items_to_module(project, module_id, codes, dry_run?)` | Assign many items in one request |
| `bulk_remove_work_items_from_module(project, codes, dry_run?)` | Clear the module on many items |

`status` is one of `backlog`, `planned`, `in_progress`, `completed`.
`start_date`/`target_date` are `YYYY-MM-DD`, `color` is a hex swatch (`#6b7280`).

## Example: reorganize a project into workstreams

```python
module = create_module(
    project="gigsnano/9f18…",
    name="Fabric Medallion Engineering",
    start_date="2026-08-01",
    target_date="2026-09-30",
    color="#6b7280",
)
# {"id": "6e1c…", "name": "Fabric Medallion Engineering", "status": "backlog",
#  "start_date": "2026-08-01", "target_date": "2026-09-30", "color": "#6b7280",
#  "story_count": 0, "completed_story_count": 0, ...}

bulk_assign_work_items_to_module(
    project="gigsnano/9f18…",
    module_id=module["id"],
    codes=["GIN-12", "GIN-13", "OTHER-1"],
    dry_run=True,
)
# {"correlation_id": "b0f0…", "module_id": "6e1c…", "dry_run": true,
#  "updated":   [{"code": "GIN-12", "id": "…", "previous_module_id": null},
#                {"code": "GIN-13", "id": "…", "previous_module_id": "aa11…"}],
#  "unchanged": [],
#  "failed":    [{"code": "OTHER-1", "error": "cross_project"}],
#  "counts": {"updated": 2, "unchanged": 0, "failed": 1}}
```

Drop `dry_run` to commit. Only `module_id` is written — assignee, status,
priority, cycle, dates, labels and parents are untouched.

- **Retry-safe.** A repeat reports the items under `unchanged` instead of
  changing anything.
- **Rollback.** Each entry carries `previous_module_id`; feed those back through
  the same tool to undo. `correlation_id` ties the change to the project activity
  feed and to each item's history.
- **Per-item failures** never block the rest: `bad_code`, `cross_project`,
  `not_found`.

## Deleting a module

`on_work_items` must state what happens to items still in it:

- `reject` (default) — 409 `module_has_work_items` while any remain.
- `unassign` — clears their module.
- `move` — moves them to `move_to_module_id` (same project).

```python
delete_module(project="gigsnano/9f18…", module_id="6e1c…", on_work_items="unassign")
# {"success": true, "work_items_affected": 7, "moved_to": null}
```

## Errors

Structured, with a stable `error_code`: `duplicate_module_name` (names are unique
per project, trimmed and case-insensitive), `module_has_work_items`,
`invalid_strategy`, `missing_target_module`. A module or work item in another
project is a 404 / `cross_project`, never a silent cross-project write.
