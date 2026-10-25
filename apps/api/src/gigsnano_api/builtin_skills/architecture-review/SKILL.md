---
name: architecture-review
version: 1.0.0
description: Evaluate a structural change for boundaries, coupling, and blast radius before committing to it.
---

# Architecture Review

**Use when:** a work item is a refactor, a new subsystem, or a change that
crosses module/layer boundaries.
**Not for:** a localized change contained within one unit.

## Steps
1. Map what depends on the code being changed — the blast radius. The smallest
   diff in the wrong place ripples.
2. Respect the existing layer boundaries and data-flow direction; don't create a
   back-edge or a cycle.
3. Prefer changing one shared unit over patching every caller; put the fix where
   all paths route through.
4. Check single responsibility: a file that keeps growing is doing too much —
   split by responsibility, not by layer.
5. Name the trade-off you're making and why the simpler option doesn't hold.

## Negative signal
A new interface with one implementation, or a config for a value that never
changes, is speculative — remove it (YAGNI).
