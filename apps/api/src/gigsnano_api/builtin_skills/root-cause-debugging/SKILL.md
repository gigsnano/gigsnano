---
name: root-cause-debugging
version: 1.0.0
description: Find and fix the actual cause of a bug, not the symptom the report names.
---

# Root-Cause Debugging

**Use when:** a work item reports a bug, crash, error, or unexpected behaviour.
**Not for:** new features (the report names a symptom; features name a want).

## Steps
1. Reproduce it reliably first — a bug you can't reproduce, you can't confirm you
   fixed.
2. Form a hypothesis about the cause and test it (log, breakpoint, bisect). Don't
   guess-patch.
3. Trace to the root: grep every caller of the function you suspect. The fix
   usually belongs in the one shared place all paths route through, not in each
   caller.
4. Fix the cause, then confirm the reproduction now passes AND no sibling path
   broke.
5. Leave a regression test (see regression-test) so it can't silently return.

## Negative signal
Patching only the path the ticket names, while sibling callers stay broken, is a
symptom fix — go up to the shared cause.
