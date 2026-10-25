"""python-doctor gate — the backend's react-doctor.

Runs the `python-doctor` CLI (security/lint/complexity/structure/exceptions/zen,
0-100 score) and filters its findings down to the lines this change touched, so
the ~200 pre-existing findings never block you and only regressions do — the same
`--scope changed` semantics react-doctor gives the frontend.

On top of the CLI it applies three house rules the generic tool cannot know, each
of which has broken this service in production:
  * a route path without a trailing slash 502s behind the frontend /api proxy
  * a bare `async_session()` bypasses the test DB override and hits PROD
  * a migration that leaves alembic multi-headed fails `upgrade head` on deploy

Usage:
    uv run python scripts/python_doctor.py                  # your changes
    uv run python scripts/python_doctor.py --scope staged   # pre-commit
    uv run python scripts/python_doctor.py --scope all      # whole repo (the CLI's own view)
    uv run python scripts/python_doctor.py --hook           # Claude Code PostToolBatch

Exit 1 when something is reported. Run the CLI directly for the score and the
full picture: `python-doctor --verbose`.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

#: The python-doctor build this gate is calibrated against. A different build has
#: different skip rules and thresholds, which is exactly how a scan can pass
#: locally and fail in CI.
PINNED_VERSION = "2026.5.11"

EDIT_TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit", "ApplyPatch"}

#: Directories python-doctor's own analyzers skip. Mirrored here so a differing
#: runner version cannot reintroduce them: a 94-line alembic `upgrade()` creating
#: three tables is what a migration looks like, not a finding.
SKIP_DIRS = ("migrations/", "docs/", ".workspaces/")

_ROUTE_RE = re.compile(r"@\w+\.(get|post|put|patch|delete)\(\s*(f?)(['\"])(.+?)\3", re.S)
_SESSION_RE = re.compile(r"^\s*(?:\w+\s*=\s*)?async_session\(\)", re.M)

Finding = tuple[str, int, str]


def _git(*args: str) -> str:
    out = subprocess.run(
        ["git", *args], cwd=ROOT, capture_output=True, text=True,
        check=False, errors="replace",
    )
    return out.stdout or ""


def changed_files(scope: str) -> list[Path]:
    if scope == "all":
        names = _git("ls-files", "*.py").split()
    elif scope == "staged":
        names = _git("diff", "--name-only", "--relative", "--cached", "--diff-filter=ACMR").split()
    else:
        names = (
            _git("diff", "--name-only", "--relative", "--diff-filter=ACMR", "HEAD").split()
            + _git("ls-files", "--others", "--exclude-standard").split()
        )
    seen: dict[str, Path] = {}
    for name in names:
        path = ROOT / name
        if name.endswith(".py") and path.exists():
            seen[name] = path
    return list(seen.values())


def touched_lines(scope: str, path: Path) -> set[int] | None:
    """Lines this change added/edited. None means "the whole file" (new/untracked,
    or --scope all)."""
    if scope == "all":
        return None
    args = ["diff", "-U0", "--diff-filter=ACMR"]
    args.append("--cached" if scope == "staged" else "HEAD")
    diff = _git(*args, "--", path.relative_to(ROOT).as_posix())
    if not diff.strip():
        return None
    lines: set[int] = set()
    for hunk in re.finditer(r"^@@ -\S+ \+(\d+)(?:,(\d+))? @@", diff, re.M):
        start = int(hunk.group(1))
        lines.update(range(start, start + int(hunk.group(2) or 1)))
    return lines


def moved_lines(scope: str) -> set[str]:
    """Lines this change *deleted* somewhere, normalized.

    A file split moves code verbatim into a new file, and every line of a new file
    reads as "yours" — so a pure move would report the whole moved body as fresh
    findings. Anything that also disappeared from another file in the same change
    is code you relocated, not code you wrote: it is judged where it came from.
    """
    if scope == "all":
        return set()
    args = ["diff", "-U0", "-M", "--cached" if scope == "staged" else "HEAD"]
    return {
        line[1:].strip()
        for line in _git(*args).splitlines()
        if line.startswith("-") and not line.startswith("---") and line[1:].strip()
    }


def run_python_doctor() -> tuple[list[Finding], int | None, float | None]:
    """(findings, score, delta). The CLI prints emoji, which the Windows console
    encoder cannot render — force UTF-8 and read JSON rather than the report."""
    env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    # `uvx` resolves the *latest* release, which is not necessarily the one
    # installed locally — pin it so CI and a developer machine agree.
    for command in (
        ["python-doctor", "--json"],
        ["uv", "tool", "run", "--from", f"python-doctor=={PINNED_VERSION}", "python-doctor", "--json"],
    ):
        result = subprocess.run(
            command, cwd=ROOT, capture_output=True, text=True, check=False, env=env
        )
        try:
            data = json.loads(result.stdout)
        except json.JSONDecodeError:
            continue  # not installed on this PATH — try the next runner
        findings: list[Finding] = []
        for name, category in (data.get("categories") or {}).items():
            for row in category.get("findings") or []:
                file = row.get("file") or ""
                try:
                    rel = Path(file).resolve().relative_to(ROOT).as_posix()
                except ValueError:
                    rel = file
                findings.append(
                    (rel, row.get("line") or 0, f"{name} {row['rule']}: {row['message']}")
                )
        delta = data.get("delta") or {}
        return findings, data.get("score"), delta.get("total") if delta.get("has_previous") else None
    return [], None, None


def house_rules(files: list[Path]) -> list[Finding]:
    findings: list[Finding] = []
    for path in files:
        rel = path.relative_to(ROOT).as_posix()
        source = path.read_text(encoding="utf-8", errors="replace")

        for match in _ROUTE_RE.finditer(source):
            route = match.group(4)
            if route.endswith("/") or route.endswith("}"):
                continue
            findings.append((
                rel, source.count("\n", 0, match.start()) + 1,
                f"house route-trailing-slash: path '{route}' has no trailing slash — "
                f"the frontend /api proxy 502s on it (gateway-direct calls hide this).",
            ))

        if "tests/" not in rel and rel != "src/gigsnano_api/core/db.py":
            for match in _SESSION_RE.finditer(source):
                findings.append((
                    rel, source.count("\n", 0, match.start()) + 1,
                    "house prod-session: bare `async_session()` ignores the get_db "
                    "override, so tests and background tasks talk to the PROD database. "
                    "Take the session from the request/task context instead.",
                ))
    return findings


def migration_heads(files: list[Path]) -> list[str]:
    if not any("migrations/versions/" in f.as_posix() for f in files):
        return []
    revisions: dict[str, tuple[str, ...]] = {}
    for path in (ROOT / "migrations" / "versions").glob("*.py"):
        text = path.read_text(encoding="utf-8", errors="replace")
        # Both spellings occur: bare `revision = "x"` and alembic's newer annotated
        # `revision: str = "x"`. Missing the annotated form made every recent
        # migration look parentless — i.e. a false multi-head report.
        rev = re.search(r"^revision(?:\s*:[^=]+)?\s*=\s*['\"]([^'\"]+)", text, re.M)
        down = re.search(r"^down_revision(?:\s*:[^=]+)?\s*=\s*(.+)$", text, re.M)
        if rev:
            # A merge migration has a tuple of parents; take them all.
            revisions[rev.group(1)] = tuple(re.findall(r"['\"]([^'\"]+)['\"]", down.group(1))) if down else ()
    parents = {parent for downs in revisions.values() for parent in downs}
    heads = [r for r in revisions if r not in parents]
    if len(heads) > 1:
        return [
            "migrations: multiple alembic heads — " + ", ".join(sorted(heads)) + ". Re-point "
            "the new migration's down_revision at the real head; a multi-head tree fails "
            "`alembic upgrade head` in entrypoint.sh and takes the API down."
        ]
    return []


def report(scope: str) -> tuple[str, str]:
    files = changed_files(scope)
    if not files:
        return "", ""
    windows = {f.relative_to(ROOT).as_posix(): touched_lines(scope, f) for f in files}
    relocated = moved_lines(scope)
    sources = {f.relative_to(ROOT).as_posix(): f.read_text(encoding="utf-8", errors="replace")
               .splitlines() for f in files}
    doctor, score, delta = run_python_doctor()

    def mine(findings: list[Finding]) -> list[Finding]:
        kept = []
        for file, line, message in findings:
            # SKIP_DIRS mirrors the CLI's own exclusions; the house rules below are
            # written *for* those directories (migrations), so they opt out of it.
            skip = file.startswith(SKIP_DIRS) and not message.startswith("house ")
            if file not in windows or skip:
                continue
            allowed = windows[file]
            # A file-level finding (line 0, e.g. "large-file") would otherwise fire on
            # every edit to an already-big file forever. Report it only for files this
            # change introduced — where it is genuinely new.
            if line == 0 and allowed is not None:
                continue
            if allowed is not None and line not in allowed:
                continue
            body = sources.get(file) or []
            anchor = body[line - 1].strip() if 0 < line <= len(body) else ""
            if anchor and anchor in relocated:
                continue  # moved here from elsewhere in this change, not written here
            kept.append((file, line, message))
        return sorted(kept)

    sections: list[str] = []
    if rows := mine(doctor):
        sections.append("== python-doctor (your changed lines) ==\n" + _format(rows))
    if rows := mine(house_rules(files)):
        sections.append("== house rules ==\n" + _format(rows))
    if heads := migration_heads(files):
        sections.append("== migrations ==\n" + "\n".join(heads))
    # The score delta is informational, never a gate: the cached previous score is
    # per-machine (CI builds its own baseline from scratch), so comparing across
    # environments red-Xes runs that introduced nothing.
    note = ""
    if delta is not None and delta < 0:
        note = (
            f"note: health score {score}/100, down {abs(delta)} since the last scan on "
            f"this machine. Run `python-doctor --verbose` for the full picture."
        )
    return "\n\n".join(sections), note


def _format(findings: list[Finding]) -> str:
    return "\n".join(f"{file}:{line} {message}" for file, line, message in findings)


def main() -> int:
    parser = argparse.ArgumentParser(description="Backend python-doctor gate.")
    parser.add_argument("--scope", choices=["changed", "staged", "all"], default="changed")
    parser.add_argument("--hook", action="store_true", help="Claude Code hook mode")
    args = parser.parse_args()

    if args.hook:
        try:
            payload = json.loads(sys.stdin.read() or "{}")
        except json.JSONDecodeError:
            payload = {}
        calls = payload.get("tool_calls") or []
        if calls and not any(c.get("tool_name") in EDIT_TOOLS for c in calls):
            return 0
        findings, _note = report("changed")
        if findings:
            print(json.dumps({
                "hookSpecificOutput": {
                    "hookEventName": payload.get("hook_event_name", "PostToolBatch"),
                    "additionalContext": (
                        "python-doctor found issues in the backend lines you changed. "
                        "Fix these before finishing.\n\n" + findings
                    ),
                }
            }))
        return 0  # a hook never fails the agent loop

    findings, note = report(args.scope)
    if note:
        print(note)
    if findings:
        print(findings)
        return 1
    print(f"python-doctor: clean ({args.scope})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
