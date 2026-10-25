---
name: gigsnano-work-item-executor
version: 1.0.0
description: Load a GigsNano work item's scope, acceptance criteria and constraints, then keep its execution state honest as you work.
---

# GigsNano Work-Item Executor

**Use when:** you are executing a GigsNano work item (a `<CODE>` like `GIN-42`)
end to end through an agent run.
**Not for:** ad-hoc code changes with no work item, or read-only questions.

## Steps
1. `get_work_item(code)` — read the title, description, acceptance criteria and
   any linked docs. `list_sub_work_items(code)` if it's an epic.
2. `resolve_execution_profile(code)` — see the pinned skills, gates and policy
   for this item; treat `required` skills as mandatory, `prohibited` as off-limits.
3. `start_work_item(code)` — claim it (moves to In Progress) before writing code.
4. Do the work against the acceptance criteria — nothing broader (YAGNI).
5. As you deliver, `report_skill_event(code, run_id, ...)` with the real state
   you reached. Availability is not invocation — only report `gate_verified`
   when a check actually passed.
6. `complete_work_item(code, pr_url, summary)` — hand back for review only when
   the acceptance criteria are met and verification passed.

## Definition of done
Every acceptance-criteria bullet is satisfied, verification evidence is attached,
and the work item reflects reality (not left in To Do or falsely Done).
