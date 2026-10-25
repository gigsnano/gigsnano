"""CLI: run the eval suite, print a scoreboard, optionally propose a prompt/situation diff.

Usage: python -m gigsnano_api.context_engine.eval [--optimize] [--only <case_id>]
Requires the live stack (FalkorDB + Node/SCIP) and a checked-out target repo.
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from gigsnano_api.context_engine.eval.harness import run_suite
from gigsnano_api.context_engine.eval.optimize import cluster, propose
from gigsnano_api.context_engine.eval.scoring import CaseResult


def _print_scoreboard(results: list[CaseResult]) -> None:
    passed = sum(1 for r in results if r.passed)
    print(f"\n=== Eval scoreboard: {passed}/{len(results)} passed ===")
    for r in results:
        flag = "PASS" if r.passed else "FAIL"
        print(f"[{flag}] {r.case_id:32} cited={r.cited_ok!s:5} tools={r.tools_ok!s:5} "
              f"judge={r.verdict.score:.2f} — {r.verdict.reason}")


async def _main() -> int:
    parser = argparse.ArgumentParser(prog="gigsnano_api.context_engine.eval")
    parser.add_argument("--optimize", action="store_true",
                        help="on failures, print a proposed (never applied) prompt/situation diff")
    parser.add_argument("--only", default=None, help="run a single case id")
    args = parser.parse_args()

    # Proposals/reasons can contain non-cp1252 chars (→, —); force UTF-8 on Windows.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    results, instruction_text, situation_text = await run_suite(only=args.only)
    _print_scoreboard(results)

    failures = cluster(results)
    if args.optimize and any(failures.values()):
        from gigsnano_api.bmad.provider import build_default_provider

        provider = build_default_provider()
        proposal = await propose(provider, failures=failures,
                                 instruction_text=instruction_text, situation_text=situation_text)
        print("\n=== Proposed change (REVIEW — not applied) ===\n")
        print(proposal)

    return 0 if all(r.passed for r in results) else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_main()))
