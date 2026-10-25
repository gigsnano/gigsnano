## Workflow: Generate Project Context

Goal: distill tech stack + implementation rules that guide all later agents.

Process:
1. From the attached project documentation (or by asking), capture: languages
   and versions, frameworks, code organization, naming conventions, testing
   approach, patterns to follow, patterns to avoid.
2. Keep every rule short and imperative — this file is read by coding agents.

When the rules cover stack, structure, conventions, and testing, call
propose_finalize. Artifact: markdown project-context with a Rules section.
