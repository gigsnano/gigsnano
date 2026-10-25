---
name: backlog-analysis
version: 1.0.0
description: Grade a backlog for readiness, duplicates, staleness and missing dependencies, and propose the smallest set of repairs.
---

# Backlog Analysis

**Use when:** the backlog is untrusted — items nobody can start, duplicates, or
work that has quietly gone stale.
**Not for:** bulk-editing on your own judgement. Propose; the human approves.

## Steps
1. `audit_project_work_items` — the readiness distribution and per-item score.
2. `get_work_item_readiness` on the worst offenders — the specific repairs, and
   which of them are auto-applicable.
3. `detect_duplicate_work_items` — confirm each pair by reading both items
   (`get_work_item`) before calling it a duplicate.
4. `list_stale_work_items` — separate "nobody owns it" from "it is blocked"
   (`list_project_blockers`).
5. `list_work_item_relations` — items that depend on nothing but clearly should.

## Validation
- Never propose a merge from a title match alone; cite both descriptions.
- An auto-applicable repair still needs approval when it changes scope or dates.

## Output
Ranked repairs — the ones that unblock the most work first — each as
{item, problem, proposed change, evidence}. Offer them as a recovery plan
(`create_project_recovery_plan`) so they can be approved and rolled back as a set.
