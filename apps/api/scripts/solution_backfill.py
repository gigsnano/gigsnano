"""CLI: restartable project solution metadata backfill (GIN-445).

Usage:
    uv run python scripts/solution_backfill.py
    uv run python scripts/solution_backfill.py --batch-size 100

Prints workspace IDs + aggregate counts only — never tenant payloads.
"""

from __future__ import annotations

import argparse
import asyncio

from gigsnano_api.core.db import async_session_scope
from gigsnano_api.features.solutions.backfill import backfill_project_solutions


async def _run(*, batch_size: int) -> int:
    async with async_session_scope() as session:
        report = await backfill_project_solutions(session, batch_size=batch_size)
    print(report.render())
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Backfill null project solution_key / solution_version"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=500,
        help="rows committed per batch (default 500)",
    )
    args = parser.parse_args()
    return asyncio.run(_run(batch_size=args.batch_size))


if __name__ == "__main__":
    raise SystemExit(main())
