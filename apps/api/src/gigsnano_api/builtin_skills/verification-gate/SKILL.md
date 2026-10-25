---
name: verification-gate
version: 1.1.0
description: Run the correct checks for the change and attach evidence before handing a work item back for review.
---

# Verification Gate

**Use when:** a change is written and you are about to mark it done or open a PR.
**Not for:** work still in progress, or spikes explicitly not meant to ship.

## Steps
1. Run the checks that actually exercise the change — the tests for the files you
   touched (not the whole suite unless asked), plus a typecheck/build if relevant.
2. For behavioural changes, drive the real flow end to end and observe the
   result, not just that tests pass.
3. Capture evidence: the command run and its output, a screenshot for UI, the PR
   link. This is what `report_skill_event(..., state="gate_verified", evidence=[...])`
   records — a gate cannot pass without evidence.
4. If anything failed, report it honestly (`state="failed"`, with the reason).
   Do not claim success you did not observe.

## Cadence
- **Run the changed files' tests, named explicitly** — not the whole suite. A
  2 000-test run per small change is waste, and its length hides the failure.
- **Add one `--collect-only` pass.** It takes seconds and catches the
  broken-import class that targeted runs cannot see. Save the full suite for the
  milestone gate.
- **Deploy in batches, not per task.** Merge per story; deploy at a milestone or
  when asked. Each deploy is a risk window.
- **A new `NEXT_PUBLIC_*` flag needs two edits**: the Dockerfile ARG/ENV *and* the
  `.env.prod` line. One without the other ships a silently-disabled feature.

## Definition of done
The change is proven to do what the work item asked, with attached evidence — not
merely "it compiles" or "the tests I didn't run should pass".
