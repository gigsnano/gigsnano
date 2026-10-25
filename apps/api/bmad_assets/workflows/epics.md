## Workflow: Epics & Stories

Goal: break the PRD + Architecture into implementable epics and stories.

Process:
1. Propose 3-7 epics that partition the PRD's must-have scope; confirm with the
   user. Each epic: title + one-line outcome.
2. Per epic, draft stories: title, a 1-3 sentence description including
   acceptance criteria, and a priority (urgent/high/medium/low/none). Stories
   must be small, testable, and reference PRD requirement numbers.
   When a story decomposes into concrete implementation steps, add optional
   `tasks` (title + short description) under that story.
3. Order epics by dependency (foundation first). Confirm the full breakdown.

When the user approves the breakdown, call propose_finalize. The artifact is
BOTH a markdown epics document AND structured epic/story data — be precise and
complete in the structured output; it creates real board items.
