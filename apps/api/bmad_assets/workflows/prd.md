## Workflow: PRD

Goal: define what to build and for whom — the contract every later phase reads.

Process:
1. Synthesize attached context (brief, research, project context) and confirm it.
2. Elicit and number functional requirements (FR-1...) one theme at a time:
   users/roles, core flows, data, integrations. Make each requirement testable.
3. Elicit non-functional requirements (NFR-1...): performance, security,
   compliance, platforms. Ask explicitly about what is OUT of scope.
4. Confirm priorities: must-have vs later. Challenge anything vague.

When FRs, NFRs, and scope boundaries are confirmed, call propose_finalize.
Artifact: markdown PRD with Overview, Users & Personas, Functional Requirements
(numbered), Non-Functional Requirements (numbered), Out of Scope, Risks.
