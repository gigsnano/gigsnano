"""Repo digest for brownfield agent context.

A bounded, prompt-cache-friendly markdown snapshot of a project's cloned
workspace (`.workspaces/<project_id>/`): the file tree plus a handful of key
files (README, manifests, entry points). Injected into BMAD chat/finalize as
`extra_context` so the agent reasons about the *actual* codebase instead of
asking the user to paste it (the reported brownfield gap).

Reads the filesystem synchronously — call `build_repo_digest` via
`asyncio.to_thread`, or use the `repo_context_block` async wrapper which also
gates on clone status. Never raises for a missing/failed clone; returns "".
"""

import asyncio
import os
from pathlib import Path

from gigsnano_api.models import ECloneStatus, Project
from gigsnano_api.workspace.paths import workspace_root

# Budgets keep the digest bounded so it stays cacheable and never dominates the
# context window. Tree is shallow + capped; key files are read in full up to a
# per-file and total cap.
_MAX_TREE_ENTRIES = 400
_MAX_DEPTH = 4
_MAX_FILE_CHARS = 12_000
_MAX_TOTAL_FILE_CHARS = 60_000
_MAX_KEY_FILES = 20

# Basenames (lowercased) worth reading in full: readmes, dependency manifests,
# build/run config, and common entry points.
_KEY_FILENAMES = frozenset(
    {
        "readme.md", "readme", "readme.rst", "readme.txt", "readme.markdown",
        "package.json", "pyproject.toml", "requirements.txt", "setup.py",
        "setup.cfg", "pipfile", "cargo.toml", "go.mod", "pom.xml",
        "build.gradle", "build.gradle.kts", "composer.json", "gemfile",
        "makefile", "dockerfile", "docker-compose.yml", "docker-compose.yaml",
        "tsconfig.json", "next.config.js", "next.config.ts", "next.config.mjs",
        ".env.example", "manifest.json", "index.js", "index.ts", "main.py",
        "app.py", "main.go", "main.rs",
    }
)

# Directories never worth walking for a snapshot (VCS, deps, build output).
_IGNORE_DIRS = frozenset(
    {
        ".git", "node_modules", ".venv", "venv", "env", "__pycache__", "dist",
        "build", ".next", ".turbo", "target", ".idea", ".vscode", "coverage",
        ".pytest_cache", ".mypy_cache", ".ruff_cache", "vendor", ".gradle",
    }
)


def build_repo_digest(project_id: str) -> str:
    """Blocking. Return a `<repository_snapshot>` markdown block, or "" when
    there is no readable workspace for this project."""
    try:
        root = workspace_root(project_id)
    except ValueError:
        return ""
    if not root.is_dir():
        return ""

    tree: list[str] = []
    key_paths: list[Path] = []
    truncated = False

    for dirpath, dirnames, filenames in os.walk(root):
        rel_dir = Path(dirpath).relative_to(root)
        depth = 0 if rel_dir == Path(".") else len(rel_dir.parts)
        # Prune ignored dirs in place (topdown walk) and stop descending at depth.
        dirnames[:] = sorted(d for d in dirnames if d not in _IGNORE_DIRS)
        if depth >= _MAX_DEPTH:
            dirnames[:] = []
        for name in sorted(filenames):
            rel = name if rel_dir == Path(".") else (rel_dir / name).as_posix()
            tree.append(rel)
            if name.lower() in _KEY_FILENAMES and len(key_paths) < _MAX_KEY_FILES:
                key_paths.append(Path(dirpath) / name)
            if len(tree) >= _MAX_TREE_ENTRIES:
                truncated = True
                break
        if truncated:
            break

    if not tree:
        return ""

    parts = [
        "<repository_snapshot>",
        "The following is the actual current state of the cloned repository for "
        "this brownfield project. Treat it as ground truth. Do NOT ask the user "
        "to paste files, the tree, or the stack that are already shown here — read "
        "them from this snapshot. Ask only about intent or anything not evident "
        "from the code itself.",
        "",
        "## File tree",
        "```",
        *tree,
    ]
    if truncated:
        parts.append(f"... (tree truncated at {_MAX_TREE_ENTRIES} entries)")
    parts.append("```")

    total = 0
    for path in key_paths:
        try:
            raw = path.read_bytes()
        except OSError:
            continue
        if b"\x00" in raw[:8192]:
            continue
        text = raw.decode("utf-8", errors="replace")
        snippet = text[:_MAX_FILE_CHARS]
        if len(text) > _MAX_FILE_CHARS:
            snippet += "\n... (truncated)"
        rel = path.relative_to(root).as_posix()
        parts += ["", f"## {rel}", "```", snippet, "```"]
        total += len(snippet)
        if total >= _MAX_TOTAL_FILE_CHARS:
            parts.append("\n... (further key files omitted to stay within budget)")
            break

    parts.append("</repository_snapshot>")
    return "\n".join(parts)


async def repo_context_block(project: Project) -> str:
    """Repo digest for a brownfield project whose clone is READY, else "".
    Runs the blocking filesystem read off the event loop."""
    if project.clone_status != ECloneStatus.READY or not project.repo_full_name:
        return ""
    return await asyncio.to_thread(build_repo_digest, project.id)
