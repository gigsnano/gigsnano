---
name: project-health-review
version: 1.0.0
description: Assess a project's real delivery health from its work items, blockers, cycle progress and forecast — read-only, evidence first.
---

# Project Health Review

**Use when:** someone asks how a project is doing, what is at risk, or what is
blocking the sprint.
**Not for:** changing anything. This skill reads. Propose changes as a recovery
plan; never apply them from here.

## Required context
The project id (`list_projects`) — everything else you gather yourself.

## Steps
1. `get_project` and `list_project_structure` — cycles, modules, milestones,
   releases. Know the shape before judging the numbers.
2. `get_cycle_progress` on the active cycle — scope, done, remaining, dates.
3. `list_project_blockers` — open blockers, their impact and escalation level.
4. `list_stale_work_items` — work that has not moved; stale ≠ blocked, report both.
5. `audit_project_work_items` — how much of the backlog is actually ready.
6. `get_project_forecast` — projected completion vs the committed dates.
7. `list_project_risks` and `list_open_project_escalations` — what is already known.

## Validation
- Every claim cites the tool result it came from. No inferred percentages.
- Separate *at risk* (forecast vs date) from *blocked* (a recorded blocker).
- An empty result is a finding ("no blockers recorded"), not silence.

## Output
A short assessment: overall status (on-track / at-risk / off-track), the three
findings that most change the outcome each with its evidence, and the single
next action. If health is bad, say what would have to be true to recover.
