---
name: regression-test
version: 1.0.0
description: Leave a test that fails on the old behaviour and passes on the new, so a fix can't silently regress.
---

# Regression Test

**Use when:** fixing a bug, or changing behaviour that must not revert later.
**Not for:** pure refactors (those anchor on existing tests, not new ones).

## Steps
1. Write a test that reproduces the bug — it must FAIL against the unfixed code.
   A test that passes before the fix proves nothing.
2. Apply the fix; the test now passes.
3. Assert the specific behaviour that was wrong, at the smallest useful level
   (unit over end-to-end where possible), with a clear name describing the case.
4. Match the repo's test framework and style; put the test beside the code it
   covers.
5. Run it (and its neighbours) to confirm green.

## Negative signal
A test with no assertion, or one that would pass even against the buggy code, is
not a regression test — make it fail first.
