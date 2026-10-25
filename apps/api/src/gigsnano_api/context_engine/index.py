"""Orchestrate a context-engine index build for one project's clone."""

from __future__ import annotations

import json
import logging
import subprocess
from pathlib import Path

from gigsnano_api.context_engine.graph import store
from gigsnano_api.context_engine.graph.build import build_graph
from gigsnano_api.context_engine.graph.project_view import to_graph_json, write_graph_json
from gigsnano_api.context_engine.parse.languages import detect
from gigsnano_api.core.config import settings

logger = logging.getLogger(__name__)


def build_context_index(repo_dir: Path, out_dir: Path, project_id: str,
                        files: list[str] | None = None) -> None:
    enabled = settings.context_engine_enabled
    graph = build_graph(project_id, repo_dir, files=files, use_scip=enabled,
                        scip_timeout_s=settings.scip_timeout_s)
    write_graph_json(out_dir, graph)  # ALWAYS -- endpoint/tool compat
    if enabled and store.available():
        try:
            if files is None:
                store.drop(project_id)
            else:
                store.delete_files(project_id, files)
            store.upsert_graph(project_id, graph)
        except Exception:  # noqa: BLE001 - FalkorDB is not on the request path
            logger.exception("FalkorDB upsert failed for project %s", project_id)


def changed_files(repo_dir: Path, since_sha: str) -> tuple[list[str], list[str]]:
    proc = subprocess.run(
        ["git", "diff", "--name-status", f"{since_sha}..HEAD"],
        cwd=str(repo_dir), capture_output=True, text=True, timeout=30, check=False,
    )
    if proc.returncode != 0:
        return ([], [])
    changed, deleted = [], []
    for line in proc.stdout.splitlines():
        parts = line.split("\t")
        if len(parts) < 2:
            continue
        status = parts[0]
        if status.startswith(("R", "C")):
            # rename/copy: "R100\told\tnew" / "C075\told\tnew" -- old path's node
            # must be dropped or it's an orphan forever; new path gets reparsed.
            old_path, new_path = parts[1], parts[-1]
            if detect(old_path) is not None:
                deleted.append(old_path)
            if detect(new_path) is not None:
                changed.append(new_path)
            continue
        path = parts[-1]
        if detect(path) is None:
            continue
        (deleted if status.startswith("D") else changed).append(path)
    return (changed, deleted)


def index_incremental(repo_dir: Path, out_dir: Path, project_id: str, since_sha: str) -> bool:
    if settings.context_engine_enabled:
        # Correct cross-file SCIP edges require a whole-repo re-ingest against all
        # nodes (untouched files' spans aren't in graph.json). Until edge-delta
        # tracking exists, fall back to a full rebuild when SCIP is enabled.
        # ponytail: named ceiling — per-file SCIP edge-delta is the later upgrade.
        return False
    graph_path = out_dir / "graph.json"
    if not graph_path.is_file():
        return False  # no base to merge onto -> caller does a full build
    changed, deleted = changed_files(repo_dir, since_sha)
    if not changed and not deleted:
        return True  # nothing to do; graph.json stays valid
    base = json.loads(graph_path.read_text(encoding="utf-8"))
    touched = set(changed) | set(deleted)
    # retain nodes/edges whose file is untouched; the reparse below re-adds changed files.
    kept_nodes = [n for n in base["nodes"] if _node_file(n) not in touched]
    kept_ids = {n["id"] for n in kept_nodes}
    kept_edges = [e for e in base["edges"]
                  if e["source"] in kept_ids and e["target"] in kept_ids]

    fresh = build_graph(project_id, repo_dir, files=changed,
                        use_scip=settings.context_engine_enabled,
                        scip_timeout_s=settings.scip_timeout_s) if changed else None
    fresh_json = to_graph_json(fresh) if fresh else {"nodes": [], "edges": []}

    merged = {"nodes": kept_nodes + fresh_json["nodes"],
              "edges": kept_edges + fresh_json["edges"]}
    graph_path.write_text(json.dumps(merged), encoding="utf-8")
    # FalkorDB sync intentionally skipped here: this path only runs when
    # context_engine_enabled is False (see the early return above), so there's
    # no SCIP graph store to keep in sync.
    return True


def _node_file(node: dict) -> str:
    return node.get("source_file") or node.get("id") or ""
