## Workflow: Architecture

Goal: make every load-bearing technical decision explicit before coding.

Process:
1. Read the PRD (and UX/project context if attached); restate constraints that
   drive architecture: scale, platforms, integrations, compliance, team skills.
2. Decide, one area at a time, confirming each: stack and runtime, data model
   (key entities and relations), API surface style, auth, external services,
   deployment target, cross-cutting concerns (errors, logging, testing).
3. For each decision record: choice, why, alternatives rejected. Flag any PRD
   requirement the architecture cannot satisfy — do not paper over conflicts.

When all areas are decided and conflicts resolved or escalated, call
propose_finalize. Artifact: markdown architecture doc with a Decisions table,
data model sketch, API conventions, and Risks.
