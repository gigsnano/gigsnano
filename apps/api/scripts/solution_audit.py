"""CLI: read-only per-workspace solution metadata audit (GIN-445).

Usage:
    uv run python scripts/solution_audit.py
    uv run python scripts/solution_audit.py --baseline audit-before.json
    uv run python scripts/solution_audit.py --write-json audit-after.json

Prints workspace IDs + aggregate counts only — never tenant payloads.
Exits non-zero when ``not report.ok`` (null/invalid metadata, or invariant
mismatch vs ``--baseline``).
"""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

from gigsnano_api.core.db import async_session_scope
from gigsnano_api.features.solutions.audit import (
    AuditReport,
    audit_solution_metadata,
)


async def _run(
    *,
    baseline_path: Path | None,
    write_json: Path | None,
) -> int:
    baseline: AuditReport | None = None
    if baseline_path is not None:
        baseline = AuditReport.from_dict(json.loads(baseline_path.read_text()))

    async with async_session_scope() as session:
        report = await audit_solution_metadata(session, baseline=baseline)

    print(report.render())
    if write_json is not None:
        write_json.write_text(json.dumps(report.to_dict(), indent=2) + "\n")
    return 0 if report.ok else 1


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Audit project solution metadata aggregates per workspace"
    )
    parser.add_argument(
        "--baseline",
        type=Path,
        default=None,
        help="path to a prior audit JSON dump for invariant comparison",
    )
    parser.add_argument(
        "--write-json",
        type=Path,
        default=None,
        help="write this run's aggregates as JSON (for a later --baseline)",
    )
    args = parser.parse_args()
    return asyncio.run(
        _run(baseline_path=args.baseline, write_json=args.write_json)
    )


if __name__ == "__main__":
    raise SystemExit(main())
