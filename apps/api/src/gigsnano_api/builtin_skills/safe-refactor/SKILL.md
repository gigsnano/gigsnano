---
name: safe-refactor
version: 1.0.0
description: Change structure without changing behaviour, in verifiable steps backed by tests.
---

# Safe Refactor

**Use when:** improving the shape of working code (renaming, extracting, moving,
de-duplicating) without changing what it does.
**Not for:** behaviour changes or bug fixes (those need new tests first).

## Steps
1. Ensure the code under change is covered by tests that pass BEFORE you start —
   they are your behaviour anchor. Add characterization tests if coverage is thin.
2. Refactor in small steps; keep the tests green after each. A red test means the
   step changed behaviour — revert and reconsider.
3. Change structure only — no new features, no fixes, smuggled in. If you find a
   bug, note it separately.
4. Prefer deletion and reuse over addition; the best refactor removes code.
5. Re-run the covering tests at the end; the behaviour must be identical.

## Negative signal
If the diff both moves code AND changes what it does, split it — refactor first,
then change behaviour, as separate commits.
