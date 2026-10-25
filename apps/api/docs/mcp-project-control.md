# MCP project control plane (GIN-382)

Phase 1a of the Autonomous Project Director epic (GIN-381): everything an agent
needs to *plan* a project and move work in batches, instead of editing one work
item at a time. Module management lives in
[mcp-module-management.md](./mcp-module-management.md).

Every tool runs as the PAT's user under the same project permissions as the REST
API — a project Viewer gets 403, a locked Sprint-0 card stays locked.

## Tools

**Planning structure**

| Tool | Purpose |
| --- | --- |
| `list_project_structure(project)` | Modules + cycles + milestones + releases with counts, in one call |
| `create_cycle` / `get_cycle` / `update_cycle` / `delete_cycle` | Sprints. `update_cycle(status="active"\|"completed")` starts/closes one |
| `get_cycle_progress` / `list_cycle_work_items` | Burn-down and contents |
| `list_milestones` / `create_milestone` / `update_milestone` / `delete_milestone` / `link_work_items_to_milestone` | Outcome milestones with progress rollups |
| `list_releases` / `create_release` / `update_release` / `link_work_items_to_release` | Releases |

**Bulk work-item changes** — `bulk_update_work_items(project, codes, changes, dry_run)`
where `changes` is an object of the fields to set (status, priority, type,
assignee_id, label_id, cycle_id, module_id, start_date, target_date) — plus the
narrow forms
`bulk_assign_work_items_to_cycle`, `bulk_assign_work_items_to_owner`,
`bulk_change_work_item_status`, `bulk_set_work_item_dates`.

**Relations** — `list_work_item_relations`, `create_work_item_relation`,
`delete_work_item_relation`, `bulk_create_work_item_relations`.

**Read-outs** — `list_project_activity`, `get_work_item_history`,
`get_project_forecast`, `validate_done_transition`.

**Backlog readiness (GIN-384)** — `audit_project_work_items`,
`get_work_item_readiness`, `detect_duplicate_work_items`.

**Blockers (GIN-383)** — `mark_work_item_blocked`, `list_project_blockers`,
`list_work_item_blockers`, `update_blocker`, `resolve_blocker`, `escalate_blocker`.

**Governance (GIN-386)** — risks (`create_project_risk`, `list_project_risks`,
`get_project_risk`, `update_project_risk`, `close_project_risk`), decisions
(`create_project_decision`, `list_open_project_decisions`, `get_project_decision`,
`resolve_project_decision`), escalations (`create_project_escalation`,
`list_open_project_escalations`, `update_project_escalation`,
`resolve_project_escalation`).

**Recovery plans (GIN-385)** — `create_project_recovery_plan`,
`list_project_recovery_plans`, `get_project_recovery_plan`,
`approve_project_recovery_plan`, `reject_project_recovery_plan`,
`apply_project_recovery_plan`, `rollback_project_recovery_plan`.

**Autonomy (GIN-387)** — `get_project_autonomy_policy`,
`update_project_autonomy_policy`, `request_project_director_action`,
`list_project_director_actions`, `get_project_director_action`,
`approve_project_director_action`, `reject_project_director_action`,
`pause_project_director`, `resume_project_director`.

## Reorganizing a disorganized project

```python
list_project_structure(project="acme/9f18…")
# {"modules": [...], "cycles": [{"id": "…", "name": "Sprint 0", "story_count": 10, ...}],
#  "milestones": [], "releases": []}

cycle = create_cycle(project="acme/9f18…", name="Recovery sprint",
                     start_date="2026-08-01", end_date="2026-08-15")

bulk_assign_work_items_to_cycle(
    project="acme/9f18…", cycle_id=cycle["id"],
    codes=["GIN-12", "GIN-13", "GIN-14"], dry_run=True,
)
# {"correlation_id": "b0f0…", "dry_run": true,
#  "changes": {"cycle_id": "…"},
#  "updated": [{"code": "GIN-12", "id": "…",
#               "previous": {"cycle_id": null}, "proposed": {"cycle_id": "…"}}],
#  "unchanged": [], "failed": [],
#  "counts": {"updated": 3, "unchanged": 0, "failed": 0}}
```

Drop `dry_run` to commit. Rules that hold for every bulk tool:

- **Only the named fields are written.** Owner, status, priority, labels, dates,
  parent and everything else on each item are untouched.
- **Per-item results, never all-or-nothing.** `failed` entries carry a reason:
  `bad_code`, `cross_project`, `not_found`, `bmad_locked`, `gate_blocked`.
- **Retry-safe.** Items already at the target value come back under `unchanged`.
- **Rollback.** Each entry carries its `previous` values — feed them back through
  `bulk_update_work_items` to undo. The `correlation_id` appears in the project
  activity feed and in every affected item's history.
- **Governance is not bypassed.** A locked Sprint-0 card and a workflow gate that
  refuses a transition both surface under `failed`; the other items still move.

## Dependencies

```python
create_work_item_relation(code="GIN-12", related_code="GIN-13", relation_type="blocking")
# GIN-12 blocks GIN-13. Types: blocking, blocked_by, duplicate, relates_to.
```

Rejected: a self-relation (400), an identical relation that already exists (409),
a relation that would close a **circular blocking chain** (409), and any item in
another project (404). `bulk_create_work_item_relations` validates each entry
independently and reports the rejects.

## Grading a backlog you inherited

```python
audit_project_work_items(project="acme/9f18…")
# {"work_items_total": 110, "matched": 110, "returned": 50, "average_score": 61,
#  "by_readiness": {"draft": 34, "needs_clarification": 41, "ready": 18,
#                   "blocked": 6, "in_progress_valid": 7, "obsolete_candidate": 4},
#  "items": [{"code": "GIN-12", "readiness": "draft", "score": 25,
#             "findings": [{"rule": "acceptance_criteria", "severity": "warning",
#                           "message": "No acceptance criteria: nothing states when this is finished.",
#                           "confidence": 0.8,
#                           "recommended_action": "Add a checklist or a Given/When/Then section…"}]}]}
```

Worst items first, so the first page is the work list. `by_readiness` tallies the
whole project even when you page; filter with `readiness="draft,blocked"` and page
with `limit`/`offset`.

Classifications: `draft`, `needs_clarification`, `ready`, `blocked`,
`in_progress_valid`, `in_review_valid`, `completion_unverified`,
`duplicate_candidate`, `obsolete_candidate`.

`get_work_item_readiness(code)` adds `proposed_repairs`. Only changes a machine
can make safely are marked `auto_applicable` — feed those to `update_work_item` or
`bulk_update_work_items`. **Missing acceptance criteria are reported as work for a
human, never invented**: the audit diagnoses, it never rewrites requirements.

Rules of note: an estimate is only expected when the project's planning method
asks for one (an Automatic project is not "missing estimates"); a blocker that is
already Done blocks nothing; `detect_duplicate_work_items` is a title heuristic
that surfaces pairs to judge, not a merger.

## Blockers: why work is stopped

A blocking *relation* says one item waits on another. A **blocker** says why work
is stopped, who owns clearing it, when it should clear, and what it costs —
including the case a relation cannot express at all: an external dependency.

```python
mark_work_item_blocked(
    code="GIN-12",
    reason="Waiting on the client's Azure tenant access",
    external_dependency="Azure tenant access request #4471",  # or blocking_code="GIN-9"
    impact="high",
    expected_resolution_date="2026-08-01",
)

list_project_blockers(project="acme/9f18…")
# {"total": 6, "open": 6, "overdue": 2, "escalated": 1, "items": [ …oldest first… ]}
```

Each blocker carries `age_days` and `overdue`. `escalate_blocker` moves
`none → team → project → sponsor → external` and **only upwards** — quietly
walking an escalation back is how an impediment stops being anyone's problem.
`resolve_blocker` asks for `resolution_evidence`; `cancelled=true` records "it was
never really blocking" as *cancelled*, not resolved.

An open blocker also makes the readiness audit report the item as `blocked`.

## Risks, decisions, escalations

The three things a PM tracks that aren't work items. Previously they lived in
prose — a status update, a Slack thread — which is why they went stale silently:
prose can't be queried, counted or chased.

```python
create_project_risk(project="acme/9f18…", title="Fabric capacity may not land in time",
                    category="external", probability=4, impact=5,
                    trigger="No capacity SKU assigned by 1 Aug",
                    mitigation="Pre-book F64 with the client's procurement")
# exposure = 20, stored — so a report of last month's exposure means what it said then.

list_project_risks(project="acme/9f18…")
# highest exposure first, with open / overdue counts
```

- `close_project_risk(occurred=true)` records that it **happened**. A register where
  materialized risks look the same as avoided ones teaches nothing next time.
- `create_project_decision` carries `options`, a `recommended_option` and
  `impact_of_delay` — that last field is what actually gets decisions made.
  `resolve_project_decision` rejects a `selected_option` that isn't one of the
  recorded keys: a decision resolved to something nobody wrote down is a memory,
  not a record.
- `create_project_escalation` names who is being asked to act (`raised_to`, often
  someone with no account here) and can link the `blocker_id` it exists to clear.
  Setting `status="acknowledged"` stamps the time, so the wait becomes measurable.

## Recovery plans: propose, approve part, apply, undo

A recovery plan is a **change set, not a document**. A plan written as Markdown
gets read once and rots; a plan made of rows can be approved change-by-change,
applied, and undone.

```python
plan = create_project_recovery_plan(
    project="acme/9f18…",
    title="Recovery: unblock the critical path",
    changes=[{"code": "GIN-12", "field": "priority", "proposed_value": "urgent",
              "reason": "blocks four other items", "confidence": 0.9}],
    from_readiness_audit=True,   # also seed the repairs a machine may safely make
)
# status "draft" — creating a plan writes nothing to the project.

approve_project_recovery_plan(project=…, plan_id=plan["id"],
                              change_ids=[plan["changes"][0]["id"]])   # partial is normal
apply_project_recovery_plan(project=…, plan_id=plan["id"])             # approved changes only
rollback_project_recovery_plan(project=…, plan_id=plan["id"])          # restores what was replaced
```

- Fields are limited to the same set the bulk endpoint writes (status, priority,
  type, assignee, label, cycle, module, dates) — a plan cannot reach anywhere a
  reviewed write cannot. Anything else is `unsupported_field`.
- `from_readiness_audit=true` seeds only what a machine can honestly propose: the
  one real case is "this item is in progress while something blocks it → move it
  back", which is a fact about two records. **Descriptions and acceptance criteria
  are never proposed.** A backlog whose only problems need judgement yields
  `empty_plan`, and says so.
- `previous_value` is captured **at apply time, not proposal time** — the row may
  have moved in between, and rollback restores what was actually replaced.
- A change that fails is recorded as `failed` and does not stop the rest.
- **A paused director cannot apply a plan** (`director_paused`), however
  well-approved it is.

## Autonomy: ask before acting

Every autonomous change should pass the policy first. The policy decides; it does
not execute.

```python
request_project_director_action(
    project="acme/9f18…",
    action="assign_module",
    reason="grouping the 41 unassigned Fabric items into workstreams",
    item_count=41,
)
# {"decision": {"allowed": false, "requires_approval": true,
#               "reasons": ["41 work items exceeds the limit of 25 per run."]},
#  "action": {"id": "…", "status": "pending", …}}
```

Within policy it comes back `auto_approved` and you may proceed; outside it, the
action is `pending` for a human (`list_project_director_actions(status="pending")`
is their queue) and `approve_project_director_action` records who decided and
when, immutably.

Defaults are conservative — a project that never configured autonomy still has
limits, and budget, committed scope, deadlines, releases, gate overrides, payments,
expert changes and KPI definitions always need a human. `pause_project_director`
refuses everything until resumed; reads keep working.

## Before marking work Done

```python
validate_done_transition(code="GIN-12")
```

Reports whether the item's required skills are evidenced on its latest agent run.
**Advisory today** — it does not block the transition, so do not autonomously move
an item to Done when it reports unmet requirements. Enforcement is GIN-389.
