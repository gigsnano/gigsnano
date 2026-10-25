# MCP capabilities: read actions, write actions, skills (GIN-392)

A connecting client (ChatGPT, Claude) groups what a server offers into three
things. GigsNano exposes all three; this is where each comes from.

## Read vs write actions

Clients group tools by `annotations.readOnlyHint` and treat an **unset** hint as
"this mutates". Every GigsNano tool used to ship unannotated, so ~70 pure GETs
were presented as write actions and the connection screen showed no Read actions
at all — a connector that looked like a set of mutation buttons.

Classification lives in one place:
[`mcp_server/classification.py`](../src/gigsnano_api/mcp_server/classification.py).

- `READ_ONLY` — tools that only ever issue GETs. `readOnlyHint=true`.
- `DESTRUCTIVE` — writes that remove or roll back state. `destructiveHint=true`.
- Anything not in `READ_ONLY` is a write with `destructiveHint=false` (additive).
  Absence is the safe default: a tool nobody classified is treated as mutating.

`apply_annotations(mcp)` runs once after the tool modules import and also gives
each tool a human-readable `title` ("List work items"), which is what the
permission screen shows instead of the function name.

`tests/mcp/test_tool_annotations.py` fails when a newly registered tool has no
classification, and when a tool listed as read-only calls `api("POST"|"PATCH"|
"PUT"|"DELETE")` directly. `tests/mcp/test_wire_contract.py` pins the same thing
over the real transport (`tools/list`).

### Read before write

Every mutation has a read counterpart, so an agent can validate state first:
`get_work_item` before `update_work_item`, `list_users` /
`list_work_item_relations` before assigning or relating, `get_cycle_progress`
before a bulk move, `get_document` before deleting. Authorization is unchanged —
each tool runs as the PAT's user under the same project permissions as the REST
API, so an unauthorized read 403/404s rather than leaking existence.

## Skills

Skills are **MCP prompts**, not tools — that is what puts them in their own group
instead of mixed in with CRUD actions. A skill is a workflow: when to use it,
required context, the tools it composes, validation rules and the expected output.

The prompt list is the workspace skill registry (GIN-284), served per caller with
the same visibility rules as `list_skills`
([`mcp_server/prompts.py`](../src/gigsnano_api/mcp_server/prompts.py)). Getting a
prompt returns that version's `SKILL.md` as the message body, optionally focused
on a `work_item` or `project` argument. The MCP SDK has no `skills` primitive
(1.28.1), so prompts are the mechanism; the registry stays the source of truth.

Delivery skills seeded from
[`builtin_skills/`](../src/gigsnano_api/builtin_skills/): `project-health-review`,
`sprint-planning`, `backlog-analysis`, `repository-analysis` — alongside the
engineering skills already there. To add one, drop a `SKILL.md` in a new folder
(frontmatter `name` must match the folder) and it seeds as a public skill; bump
the frontmatter `version` to publish an update.

| Layer | What it is | Where it lives |
| --- | --- | --- |
| MCP tool | One API call, annotated read or write | `mcp_server/tools/` |
| Read action | A tool with `readOnlyHint=true` | `classification.READ_ONLY` |
| Write action | Everything else; destructive ones flagged | `classification.DESTRUCTIVE` |
| Skill | A workflow over many tools, served as a prompt | `builtin_skills/` + registry |

## Document-package import (GIN-399)

Fifteen tools drive the GIN-393 import pipeline end to end — upload, analyse,
correct, propose, preview, decide, apply, trace, roll back:

| Read | Write |
| --- | --- |
| `get_project_package` · `list_project_findings` · `preview_project_import` · `get_document_traceability` · `list_project_intake_gaps` · `get_project_intake_status` | `upload_project_package` · `analyse_project_documents` · `classify_project_documents` · `set_canonical_project_document` · `propose_project_structure_from_documents` · `decide_project_import_changes` · `apply_project_import` · `resolve_project_intake_gap` · `rollback_project_import` |

`rollback_project_import` is the only one flagged destructive; every other write
is additive.

Two tools from the original ticket are deliberately absent rather than stubbed.
`create_work_items_from_document_sections` is `propose…` + `apply…`, and a tool
doing both in one call would bypass the review step the epic exists to enforce.
`create_dependencies_from_documents` has nothing to link: a dependency finding
names a relationship in prose but not its two endpoints, and `apply` reports
those changes as needing them chosen rather than guessing at links between real
work items.
