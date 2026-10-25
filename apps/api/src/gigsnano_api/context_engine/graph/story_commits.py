"""Derive Story→code links from commit messages that reference a story code.

No PR API needed: parse ``git log`` for story codes (e.g. ``GIN-84``) and collect
the files each such commit touched. The caller resolves files → symbol node_ids
and emits STORY_MODIFIES_CODE edges. GIA-15.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

_CODE_RE = re.compile(r"\b[A-Z][A-Z0-9]+-\d+\b")


def _commit_files(repo_dir: Path | str, sha: str) -> list[str]:
    p = subprocess.run(
        ["git", "show", "--name-only", "--pretty=format:", sha],
        cwd=str(repo_dir), capture_output=True, text=True, timeout=30, check=False,
    )
    return [line.strip() for line in p.stdout.splitlines() if line.strip()]


def commit_story_files(
    repo_dir: Path | str,
    codes: set[str],
    max_count: int = 5000,
) -> list[tuple[str, str]]:
    """Return ``(story_code, file_path)`` pairs for commits whose message mentions
    one of ``codes``. Only known codes are kept, so a stray "ABC-1" is ignored."""
    proc = subprocess.run(
        ["git", "log", f"--max-count={max_count}", "--pretty=format:%H%x1f%B%x1e"],
        cwd=str(repo_dir), capture_output=True, text=True, timeout=90, check=False,
    )
    if proc.returncode != 0:
        return []
    out: list[tuple[str, str]] = []
    for rec in proc.stdout.split("\x1e"):
        rec = rec.strip("\n")
        if not rec:
            continue
        sha, _, msg = rec.partition("\x1f")
        found = {c for c in _CODE_RE.findall(msg) if c in codes}
        if not found:
            continue
        for f in _commit_files(repo_dir, sha.strip()):
            for c in found:
                out.append((c, f))
    return out
