"""Assemble one CodeGraph from the structural pass + (deep langs) SCIP edges."""

from __future__ import annotations

import logging
import subprocess
from pathlib import Path

from gigsnano_api.context_engine.graph.model import CodeGraph
from gigsnano_api.context_engine.parse import structural
from gigsnano_api.context_engine.parse.languages import detect, is_deep
from gigsnano_api.context_engine.parse.precise import runner, scip_ingest

logger = logging.getLogger(__name__)
# Fallback only (non-git dirs). The primary exclusion is the repo's own .gitignore via
# `git ls-files` — which is tech-stack-appropriate (a Node repo ignores .next/node_modules,
# a Rust repo target/, a Python __pycache__, ...) so we don't hardcode per-stack noise.
_SKIP_DIRS = {".git", "node_modules", ".venv", "venv", "dist", "build", ".scip",
              ".graphify-index", "__pycache__", ".next", ".turbo", "out", "coverage",
              ".cache", ".pytest_cache", ".mypy_cache"}


def _git_tracked_files(repo_dir: Path) -> list[str] | None:
    """Files git tracks (posix-relative). Respects the repo's .gitignore, so generated
    build/output/dependency dirs are excluded without a hardcoded per-stack list.
    Returns None when repo_dir isn't a git repo (or git is unavailable) → caller falls back."""
    try:
        proc = subprocess.run(
            ["git", "-C", str(repo_dir), "ls-files"],
            capture_output=True, text=True, timeout=60, check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if proc.returncode != 0:
        return None
    return [line for line in proc.stdout.splitlines() if line]


def _walk_code_files(repo_dir: Path) -> list[str]:
    tracked = _git_tracked_files(repo_dir)
    if tracked is not None:
        return [f for f in tracked if detect(f)]
    # Fallback: not a git repo — walk the tree, skipping common artifact/dep dirs.
    out: list[str] = []
    for p in repo_dir.rglob("*"):
        if not p.is_file():
            continue
        rel = p.relative_to(repo_dir)
        if any(part in _SKIP_DIRS for part in rel.parts):
            continue
        if detect(rel.as_posix()):
            out.append(rel.as_posix())
    return out


def build_graph(repo_id: str, repo_dir: Path, files: list[str] | None = None,
                use_scip: bool = True, scip_timeout_s: int = 900) -> CodeGraph:
    rels = files if files is not None else _walk_code_files(repo_dir)
    graph = CodeGraph()
    langs_present: set[str] = set()
    for rel in rels:
        lang = detect(rel)
        if lang is None:
            continue
        try:
            structural.parse_file(repo_id, repo_dir, rel, graph)
            if is_deep(lang):
                langs_present.add(lang)
        except Exception:  # noqa: BLE001 - one bad file must not kill the index
            logger.exception("structural parse failed for %s", rel)

    if use_scip:
        for lang in sorted(langs_present):
            out_file = repo_dir / ".scip" / f"{lang}.scip"
            index = runner.run_scip(lang, repo_dir, out_file, scip_timeout_s)
            if index is None:
                for n in graph.nodes.values():
                    if n.language == lang:
                        n.degraded = True
                continue
            scip_ingest.ingest(repo_id, index, graph)
    return graph
