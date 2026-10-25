---
name: repo-context-loader
version: 1.0.0
description: Inspect the relevant repository context before planning a change, so edits match existing conventions instead of inventing new ones.
---

# Repo Context Loader

**Use when:** starting any implementation task in an unfamiliar or large
codebase — before writing or editing code.
**Not for:** trivial one-line changes in a file you already fully understand.

## Steps
1. Locate the feature: search for the symbols, routes, or strings the task names
   rather than guessing file paths.
2. Read the files the change will touch end to end, plus their immediate callers
   — the smallest fix in the wrong place is a second bug.
3. Note the local conventions: naming, error handling, test style, the layer
   boundaries. New code must read like the code around it.
4. In GigsNano, prefer the codebase-intelligence tools when available
   (`get_codebase_overview`, `get_codebase_architecture`, `trace_codebase_feature`)
   to find where a feature lives and what depends on it.
5. Only then plan the change, naming every file it will touch.

## Negative signal
If you are about to add an abstraction, a dependency, or a pattern the repo
doesn't already use, stop — reuse what's there first.
