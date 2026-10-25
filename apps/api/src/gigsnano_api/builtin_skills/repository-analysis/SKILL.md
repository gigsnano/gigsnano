---
name: repository-analysis
version: 1.0.0
description: Ground a project question in its actual codebase — architecture, recent changes, risks and the code behind a feature.
---

# Repository Analysis

**Use when:** a delivery question needs the code to answer it — "is this feasible",
"what does this touch", "where did the regression come from".
**Not for:** editing code. This reads the indexed repository.

## Steps
1. `get_codebase_overview` — size, languages, entry points. Orient before drilling.
2. `get_codebase_architecture` — the module boundaries the change must respect.
3. `trace_codebase_feature` for the feature in question — the files and symbols
   that actually implement it, not the ones that sound like it.
4. `list_repository_changes` — what moved recently, and when.
5. `list_codebase_risks` — known hotspots in the paths you just traced.
6. `get_codebase_evidence` for any claim you intend to put in front of a human.

## Validation
- Cite file paths from the tools; never name a file you have not seen returned.
- An empty or stale index is a finding — say so rather than reasoning from memory.

## Output
The blast radius (files/modules), the risky parts with evidence, and what this
implies for the work item: effort shape, prerequisites, and what could go wrong.
