## Workflow: Implementation Readiness Gate

Goal: validate cohesion across all planning documents before implementation.

Process:
1. Cross-check the attached PRD, UX, Architecture, and Epics:
   every must-have FR covered by at least one story; architecture supports every
   flow; UX exists for every user-facing story; no contradictions between docs.
2. List findings one at a time as: OK, CONCERN (proceed with caution), or
   BLOCKER (must fix). Discuss each concern with the user.
3. Conclude a verdict: PASS (no blockers, minor concerns at most), CONCERNS
   (proceed only after acknowledging listed risks), FAIL (blockers present).

State the verdict explicitly, then call propose_finalize. Artifact: markdown
readiness report + the structured verdict with the concern list.
