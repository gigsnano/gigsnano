---
name: sprint-planning
version: 1.0.0
description: Plan the next cycle from ready work, real capacity and known blockers — read the state before moving anything.
---

# Sprint Planning

**Use when:** filling or rebalancing a cycle.
**Not for:** inventing scope. Plan what exists; missing work is a finding.

## Required context
The project id, and the cycle to plan (`list_cycles`, or create one).

## Read before you write
1. `get_cycle_progress` on the current cycle — what is actually going to land,
   and what will spill.
2. `list_work_items` filtered to the backlog + `audit_project_work_items` —
   only *ready* items are candidates. Unready ones get a readiness fix, not a slot.
3. `list_project_blockers` — a blocked item does not go in the sprint.
4. `list_work_item_relations` on each candidate — never schedule an item before
   the item that blocks it.
5. `list_users` — who is available to own the work.

## Then act
- `bulk_assign_work_items_to_cycle` for the selection, `bulk_assign_work_items_to_owner`
  for ownership. Use `dry_run` first and show the caller the diff.
- Leave items you excluded in the plan with the reason.

## Validation
- No item scheduled that is blocked, unready, or depends on unscheduled work.
- The plan fits the demonstrated throughput, not the hoped-for one.

## Output
The proposed cycle contents (item, owner, why), the excluded items with reasons,
and the dependency order. Ask for confirmation before the non-dry-run write.
