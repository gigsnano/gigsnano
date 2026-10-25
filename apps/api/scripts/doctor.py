#!/usr/bin/env python3
"""Python doctor — lint + format check + tests (React Doctor equivalent)."""

from __future__ import annotations

import subprocess
import sys


def run(label: str, cmd: list[str]) -> int:
    print(f"\n==> {label}")
    result = subprocess.run(cmd, check=False)
    return result.returncode


def main() -> int:
    steps = [
        ("ruff lint", ["uv", "run", "ruff", "check", "."]),
        ("ruff format (check)", ["uv", "run", "ruff", "format", "--check", "."]),
        ("pytest", ["uv", "run", "pytest", "-q"]),
    ]
    failed = [label for label, cmd in steps if run(label, cmd) != 0]
    if failed:
        print(f"\nDoctor failed: {', '.join(failed)}", file=sys.stderr)
        return 1
    print("\nDoctor passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
