"""Read-only code tools over a project's cloned repo + graphify index. All mutating=False."""

from __future__ import annotations

import json
import os
import re as _re
import subprocess
from pathlib import Path

from sqlalchemy import select

from gigsnano_api.agent.tools.base import Tool, ToolContext, ToolRegistry, ToolResult
from gigsnano_api.context_engine.graph import queries as ce_queries
from gigsnano_api.context_engine.graph import store as ce_store
from gigsnano_api.context_engine.graph.resolve import resolve_symbol
from gigsnano_api.models import ECloneStatus, ECodeArtifactKind, EIndexStatus, Project
from gigsnano_api.shared.context import accessible_project_ids
from gigsnano_api.workspace.code_artifacts import load_artifact
from gigsnano_api.workspace.paths import workspace_root

_MAX_READ_BYTES = 40_000
_MAX_GREP_HITS = 40
_MAX_GREP_FILE_BYTES = 2_000_000
_CODE_EXTS = {
    ".py",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".go",
    ".rs",
    ".java",
    ".rb",
    ".php",
    ".cs",
    ".md",
}


_SHA_RE = _re.compile(r"^[0-9a-fA-F]{4,40}$")


def _valid_sha(s: str) -> bool:
    return bool(_SHA_RE.match(s or ""))


async def _load_project(ctx: ToolContext, project_id: str) -> Project | None:
    """Tenant- and membership-checked, same pattern as `health.py::_scoped_project` /
    `spend.py::_scope`: workspace match alone isn't enough — a workspace member with
    no `ProjectMember` row on THIS project must not read its repo/code context just
    because they share the workspace (this was the pre-existing gap those two
    modules were built to avoid repeating). `accessible_project_ids` is `None` for
    Owner/Admin (see every project) or the caller's active `ProjectMember` project
    ids otherwise — the same rule `get_project_or_404` enforces over HTTP."""

    async def _lookup(pid: str | None) -> Project | None:
        if not pid:
            return None
        proj = (
            await ctx.db.execute(select(Project).where(Project.id == pid))
        ).scalar_one_or_none()
        if proj is None or proj.workspace_id != ctx.workspace.id:
            return None
        pids = await accessible_project_ids(ctx.db, ctx)
        if pids is not None and proj.id not in pids:
            return None
        return proj

    # Prefer the id the agent passed; if it's empty/unknown, fall back to the
    # surface's in-scope project so the model can't fail on a fumbled project_id.
    return await _lookup(project_id) or await _lookup(ctx.project_id)


def _resolve_in_repo(project_id: str, rel_path: str) -> Path | None:
    """Resolve rel_path inside the project's workspace, or None if it escapes."""
    root = workspace_root(project_id)
    candidate = (root / rel_path).resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        return None
    return candidate


def _cite(node: dict) -> str:
    return f"{node['symbol_path']} — {node['file_path']}:{node['start_line']}-{node['end_line']}"


async def _gated_graph(ctx: ToolContext, project_id: str) -> tuple[Project | None, ToolResult | None]:
    """(project, error_result). error_result is a ToolResult to return as-is when the
    graph isn't usable; else None and project is the loaded Project."""
    proj = await _load_project(ctx, project_id)
    if proj is None:
        return None, ToolResult("Project not found in this workspace.", is_error=True)
    if (
        proj.index_status != EIndexStatus.READY
        or not ce_store.available()
        or ce_store.count_nodes(proj.id) == 0
    ):
        return proj, ToolResult(
            "The code graph is not available for this project — use code_grep / read_file instead.",
            summary="graph unavailable",
        )
    return proj, None


async def _search_symbols(ctx: ToolContext, args: dict) -> ToolResult:
    proj, err = await _gated_graph(ctx, args.get("project_id", ""))
    if err is not None:
        return err
    rows = ce_queries.search_symbols(proj.id, str(args.get("name", "")), args.get("kind") or None)
    if not rows:
        return ToolResult(f"No symbols match {args.get('name')!r}.", summary="search: 0")
    return ToolResult("\n".join(_cite(r) for r in rows), summary=f"search: {len(rows)}")


async def _read_symbol(ctx: ToolContext, args: dict) -> ToolResult:
    proj, err = await _gated_graph(ctx, args.get("project_id", ""))
    if err is not None:
        return err
    cands = resolve_symbol(proj.id, str(args.get("ref", "")))
    if not cands:
        return ToolResult(f"No symbol resolves to {args.get('ref')!r}.", is_error=True)
    node = cands[0]
    target = _resolve_in_repo(proj.id, node["file_path"])
    if target is None or not target.is_file():
        return ToolResult("Source file not found.", is_error=True)
    lines = target.read_text(encoding="utf-8", errors="replace").splitlines()
    snippet = "\n".join(lines[node["start_line"] - 1 : node["end_line"]])[:_MAX_READ_BYTES]
    header = f"[{node['file_path']}:{node['start_line']}-{node['end_line']}] {node['symbol_path']}"
    extra = f"\n({len(cands) - 1} other matches)" if len(cands) > 1 else ""
    return ToolResult(f"{header}\n{snippet}{extra}", summary=f"read {node['symbol_path']}")


async def _read_file(ctx: ToolContext, args: dict) -> ToolResult:
    proj = await _load_project(ctx, args.get("project_id", ""))
    if proj is None:
        return ToolResult("Project not found in this workspace.", is_error=True)
    if proj.clone_status != ECloneStatus.READY:
        return ToolResult("The repository is not cloned yet.", is_error=True)
    target = _resolve_in_repo(proj.id, str(args.get("path", "")))
    if target is None or not target.is_file():
        return ToolResult("File not found or path not allowed.", is_error=True)
    if target.stat().st_size > _MAX_READ_BYTES:
        with target.open("rb") as f:
            raw = f.read(_MAX_READ_BYTES)
        text = raw.decode("utf-8", errors="replace")
    else:
        text = target.read_text(encoding="utf-8", errors="replace")
    return ToolResult(text, summary=f"read {args.get('path')}")


async def _code_grep(ctx: ToolContext, args: dict) -> ToolResult:
    proj = await _load_project(ctx, args.get("project_id", ""))
    if proj is None:
        return ToolResult("Project not found in this workspace.", is_error=True)
    if proj.clone_status != ECloneStatus.READY:
        return ToolResult("The repository is not cloned yet.", is_error=True)
    pattern = str(args.get("pattern", "")).strip()
    if not pattern:
        return ToolResult("Empty search pattern.", is_error=True)
    root = workspace_root(proj.id)
    resolved_root = root.resolve()
    hits: list[str] = []
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        if len(hits) >= _MAX_GREP_HITS:
            break
        dirnames.sort()
        for name in sorted(filenames):
            if len(hits) >= _MAX_GREP_HITS:
                break
            p = Path(dirpath) / name
            if p.is_symlink() or p.suffix not in _CODE_EXTS:
                continue
            try:
                resolved = p.resolve()
                resolved.relative_to(resolved_root)
            except (OSError, ValueError):
                continue
            try:
                if not p.is_file() or p.stat().st_size > _MAX_GREP_FILE_BYTES:
                    continue
                for i, line in enumerate(
                    p.read_text(encoding="utf-8", errors="replace").splitlines(), 1
                ):
                    if pattern in line:
                        hits.append(f"{p.relative_to(root).as_posix()}:{i}: {line.strip()[:200]}")
                        if len(hits) >= _MAX_GREP_HITS:
                            break
            except OSError:
                continue
    if not hits:
        return ToolResult(f"No matches for {pattern!r}.", summary=f"grep {pattern}: 0")
    return ToolResult("\n".join(hits), summary=f"grep {pattern}: {len(hits)}")


async def _code_graph_query(ctx: ToolContext, args: dict) -> ToolResult:
    proj = await _load_project(ctx, args.get("project_id", ""))
    if proj is None:
        return ToolResult("Project not found in this workspace.", is_error=True)
    if proj.index_status != EIndexStatus.READY:
        return ToolResult("The code index is not ready yet.", is_error=True)
    row = await load_artifact(ctx.db, proj.id, ECodeArtifactKind.GRAPH)
    if row is None:
        return ToolResult("The code graph is missing.", is_error=True)
    graph = row.data
    query = str(args.get("query", "")).strip().lower()
    nodes = graph.get("nodes", [])
    matched = [n for n in nodes if query in json.dumps(n).lower()][:25]
    if not matched:
        return ToolResult(f"No graph nodes match {query!r}.", summary="graph query: 0")
    ids = {n.get("id") for n in matched}
    edges = [e for e in graph.get("edges", []) if e.get("source") in ids or e.get("target") in ids][
        :40
    ]
    payload = {"nodes": matched, "edges": edges}
    return ToolResult(json.dumps(payload), summary=f"graph query: {len(matched)} nodes")


async def _er_schema(ctx: ToolContext, args: dict) -> ToolResult:
    proj = await _load_project(ctx, args.get("project_id", ""))
    if proj is None:
        return ToolResult("Project not found in this workspace.", is_error=True)
    if proj.index_status != EIndexStatus.READY:
        return ToolResult("The code index is not ready yet.", is_error=True)
    row = await load_artifact(ctx.db, proj.id, ECodeArtifactKind.ER)
    if row is None:
        return ToolResult('{"tables":[],"relations":[]}', summary="er: none")
    return ToolResult(json.dumps(row.data), summary="er schema")


async def _code_metrics(ctx: ToolContext, args: dict) -> ToolResult:
    proj = await _load_project(ctx, args.get("project_id", ""))
    if proj is None:
        return ToolResult("Project not found in this workspace.", is_error=True)
    if proj.index_status != EIndexStatus.READY:
        return ToolResult("The code index is not ready yet.", is_error=True)
    row = await load_artifact(ctx.db, proj.id, ECodeArtifactKind.METRICS)
    if row is None:
        return ToolResult("No metrics have been computed for this project yet.", is_error=True)
    return ToolResult(json.dumps(row.data), summary="code metrics")


CODE_GRAPH_QUERY_SCHEMA = {
    "type": "object",
    "properties": {
        "project_id": {"type": "string", "description": "The project whose repo to query."},
        "query": {
            "type": "string",
            "description": "Symbol name or keyword to locate in the code graph.",
        },
    },
    "required": ["project_id", "query"],
}
READ_FILE_SCHEMA = {
    "type": "object",
    "properties": {
        "project_id": {"type": "string"},
        "path": {"type": "string", "description": "Repo-relative file path."},
    },
    "required": ["project_id", "path"],
}
CODE_GREP_SCHEMA = {
    "type": "object",
    "properties": {
        "project_id": {"type": "string"},
        "pattern": {
            "type": "string",
            "description": "Substring to search for across source files.",
        },
    },
    "required": ["project_id", "pattern"],
}

SEARCH_SYMBOLS_SCHEMA = {
    "type": "object",
    "properties": {
        "project_id": {"type": "string"},
        "name": {"type": "string", "description": "Symbol name or fragment."},
        "kind": {"type": "string", "description": "Optional: file|class|function|method|interface."},
    },
    "required": ["project_id", "name"],
}
READ_SYMBOL_SCHEMA = {
    "type": "object",
    "properties": {
        "project_id": {"type": "string"},
        "ref": {"type": "string"},
    },
    "required": ["project_id", "ref"],
}

CODE_GRAPH_QUERY = Tool(
    name="code_graph_query",
    description="Search the project's code graph for symbols/files and their relationships. Cheap navigation; use before reading files.",
    input_schema=CODE_GRAPH_QUERY_SCHEMA,
    handler=_code_graph_query,
    mutating=False,
)
READ_FILE = Tool(
    name="read_file",
    description="Read a file from the project's cloned repository (repo-relative path).",
    input_schema=READ_FILE_SCHEMA,
    handler=_read_file,
    mutating=False,
)
CODE_GREP = Tool(
    name="code_grep",
    description="Search the project's source files for a substring; returns file:line matches. Use for framework wiring the graph misses (routes, decorators).",
    input_schema=CODE_GREP_SCHEMA,
    handler=_code_grep,
    mutating=False,
)
ER_SCHEMA = Tool(
    name="er_schema",
    description="Return the project's database ER schema (tables/columns/relations).",
    input_schema={
        "type": "object",
        "properties": {"project_id": {"type": "string"}},
        "required": ["project_id"],
    },
    handler=_er_schema,
    mutating=False,
)
CODE_METRICS = Tool(
    name="code_metrics",
    description=(
        "Return the project's static code metrics: size/LOC by language, complexity, "
        "duplication, churn/complexity hotspots, and a summary of static-analysis "
        "issues (counts by severity, the most frequent rules, and the most severe "
        "findings with file/line). Use to cite which files are hotspots or which "
        "issues matter. Note: `duplication.percent` and `issues` are null when that "
        "analyzer did not run -- that means 'not measured', NOT zero; say so rather "
        "than reporting a clean result. The issue list is a capped summary, not the "
        "full set."
    ),
    input_schema={
        "type": "object",
        "properties": {"project_id": {"type": "string"}},
        "required": ["project_id"],
    },
    handler=_code_metrics,
    mutating=False,
)


SEARCH_SYMBOLS = Tool(
    name="search_symbols",
    description="Find code symbols (functions/classes/methods) by name in the project's code graph. Returns their file:line. Use to locate an entry point before tracing.",
    input_schema=SEARCH_SYMBOLS_SCHEMA,
    handler=_search_symbols,
    mutating=False,
)
READ_SYMBOL = Tool(
    name="read_symbol",
    description="Read a symbol's source code by name/path (e.g. 'verify_token' or 'auth/login.py:verify_token'). Returns the code with its file:line citation.",
    input_schema=READ_SYMBOL_SCHEMA,
    handler=_read_symbol,
    mutating=False,
)


async def _resolve_one(proj_id: str, ref: str) -> dict | None:
    cands = resolve_symbol(proj_id, ref)
    return cands[0] if cands else None


async def _callers(ctx: ToolContext, args: dict) -> ToolResult:
    proj, err = await _gated_graph(ctx, args.get("project_id", ""))
    if err:
        return err
    node = await _resolve_one(proj.id, str(args.get("ref", "")))
    if not node:
        return ToolResult(f"No symbol resolves to {args.get('ref')!r}.", is_error=True)
    rows = ce_queries.callers(proj.id, node["node_id"])
    if not rows:
        return ToolResult(f"No callers of {node['symbol_path']}.", summary="callers: 0")
    return ToolResult("\n".join(_cite(r) for r in rows), summary=f"callers: {len(rows)}")


async def _callees(ctx: ToolContext, args: dict) -> ToolResult:
    proj, err = await _gated_graph(ctx, args.get("project_id", ""))
    if err:
        return err
    node = await _resolve_one(proj.id, str(args.get("ref", "")))
    if not node:
        return ToolResult(f"No symbol resolves to {args.get('ref')!r}.", is_error=True)
    rows = ce_queries.callees(proj.id, node["node_id"])
    if not rows:
        return ToolResult(f"No callees of {node['symbol_path']}.", summary="callees: 0")
    return ToolResult("\n".join(_cite(r) for r in rows), summary=f"callees: {len(rows)}")


async def _trace_path(ctx: ToolContext, args: dict) -> ToolResult:
    proj, err = await _gated_graph(ctx, args.get("project_id", ""))
    if err:
        return err
    a = await _resolve_one(proj.id, str(args.get("from", "")))
    b = await _resolve_one(proj.id, str(args.get("to", "")))
    if not a or not b:
        return ToolResult("Could not resolve both endpoints.", is_error=True)
    path = ce_queries.shortest_call_path(proj.id, a["node_id"], b["node_id"])
    if not path:
        return ToolResult(
            f"No call path (≤8 hops) from {a['symbol_path']} to {b['symbol_path']}.",
            summary="trace: none",
        )
    return ToolResult(" → ".join(path), summary=f"trace: {len(path)} hops")


async def _change_impact(ctx: ToolContext, args: dict) -> ToolResult:
    proj, err = await _gated_graph(ctx, args.get("project_id", ""))
    if err:
        return err
    node = await _resolve_one(proj.id, str(args.get("ref", "")))
    if not node:
        return ToolResult(f"No symbol resolves to {args.get('ref')!r}.", is_error=True)
    rows = ce_queries.change_impact(proj.id, node["node_id"])
    head = f"{len(rows)} symbols transitively call {node['symbol_path']} (blast radius):\n"
    return ToolResult(head + "\n".join(_cite(r) for r in rows), summary=f"impact: {len(rows)}")


async def _api_flow(ctx: ToolContext, args: dict) -> ToolResult:
    proj, err = await _gated_graph(ctx, args.get("project_id", ""))
    if err:
        return err
    node = await _resolve_one(proj.id, str(args.get("entry", "")))
    if not node:
        return ToolResult(f"No symbol resolves to {args.get('entry')!r}.", is_error=True)
    rows = ce_queries.api_flow(proj.id, node["node_id"])
    head = f"Downstream call flow from {node['symbol_path']}:\n"
    return ToolResult(head + "\n".join(_cite(r) for r in rows), summary=f"flow: {len(rows)}")


def _ref_schema(key: str = "ref") -> dict:
    return {
        "type": "object",
        "properties": {"project_id": {"type": "string"}, key: {"type": "string"}},
        "required": ["project_id", key],
    }


FIND_CALLERS = Tool(
    name="find_callers",
    description="List the functions/methods that call the given symbol (with file:line). Use to see what depends on it.",
    input_schema=_ref_schema(),
    handler=_callers,
    mutating=False,
)
FIND_CALLEES = Tool(
    name="find_callees",
    description="List the functions/methods the given symbol calls (with file:line).",
    input_schema=_ref_schema(),
    handler=_callees,
    mutating=False,
)
TRACE_PATH = Tool(
    name="trace_path",
    description="Show the shortest call chain between two symbols. Args: from, to (symbol names/paths).",
    input_schema={
        "type": "object",
        "properties": {
            "project_id": {"type": "string"},
            "from": {"type": "string"},
            "to": {"type": "string"},
        },
        "required": ["project_id", "from", "to"],
    },
    handler=_trace_path,
    mutating=False,
)
CALCULATE_CHANGE_IMPACT = Tool(
    name="calculate_change_impact",
    description="List everything that transitively calls a symbol — the blast radius if you change it.",
    input_schema=_ref_schema(),
    handler=_change_impact,
    mutating=False,
)
FIND_API_FLOW = Tool(
    name="find_api_flow",
    description="Trace the downstream call flow from an entry point (e.g. a route handler) through the services/models it reaches.",
    input_schema=_ref_schema("entry"),
    handler=_api_flow,
    mutating=False,
)


def _build_tree(paths: list[str]) -> str:
    return "\n".join(sorted(paths))  # flat, sorted; the model reads paths, not ASCII art


async def _get_file_tree(ctx: ToolContext, args: dict) -> ToolResult:
    proj, err = await _gated_graph(ctx, args.get("project_id", ""))
    if err:
        return err
    paths = ce_queries.file_paths(proj.id, args.get("dir") or None)
    return ToolResult(_build_tree(paths) or "(no files indexed)", summary=f"tree: {len(paths)} files")


async def _find_related_tests(ctx: ToolContext, args: dict) -> ToolResult:
    proj, err = await _gated_graph(ctx, args.get("project_id", ""))
    if err:
        return err
    node = await _resolve_one(proj.id, str(args.get("ref", "")))
    if not node:
        return ToolResult(f"No symbol resolves to {args.get('ref')!r}.", is_error=True)
    files = ce_queries.test_callers(proj.id, node["node_id"])
    return ToolResult(
        "\n".join(files) if files else f"No test files reference {node['symbol_path']}.",
        summary=f"tests: {len(files)}",
    )


async def _compare_commits(ctx: ToolContext, args: dict) -> ToolResult:
    proj, err = await _gated_graph(ctx, args.get("project_id", ""))
    if err:
        return err
    a, b = str(args.get("sha_a", "")), str(args.get("sha_b", ""))
    if not (_valid_sha(a) and _valid_sha(b)):
        return ToolResult("Invalid commit sha.", is_error=True)
    root = workspace_root(proj.id)
    proc = subprocess.run(
        ["git", "diff", "--name-only", a, b],
        cwd=str(root),
        stdin=subprocess.DEVNULL,
        capture_output=True,
        timeout=30,
        check=False,
    )
    if proc.returncode != 0:
        return ToolResult("git diff failed (unknown commits?).", is_error=True)
    files = [f for f in proc.stdout.decode("utf-8", "replace").splitlines() if f.strip()]
    syms = ce_queries.symbols_in_files(proj.id, files)
    head = f"{len(files)} files changed between {a[:7]} and {b[:7]}; {len(syms)} indexed symbols affected:\n"
    return ToolResult(head + "\n".join(_cite(s) for s in syms), summary=f"diff: {len(files)} files")


GET_FILE_TREE = Tool(
    name="get_file_tree",
    description="List the repository's indexed files (optionally under a directory prefix).",
    input_schema={
        "type": "object",
        "properties": {"project_id": {"type": "string"}, "dir": {"type": "string"}},
        "required": ["project_id"],
    },
    handler=_get_file_tree,
    mutating=False,
)
FIND_RELATED_TESTS = Tool(
    name="find_related_tests",
    description="List test files that exercise the given symbol.",
    input_schema=_ref_schema(),
    handler=_find_related_tests,
    mutating=False,
)
COMPARE_COMMITS = Tool(
    name="compare_commits",
    description="List the symbols affected by the changes between two commit shas (sha_a, sha_b).",
    input_schema={
        "type": "object",
        "properties": {
            "project_id": {"type": "string"},
            "sha_a": {"type": "string"},
            "sha_b": {"type": "string"},
        },
        "required": ["project_id", "sha_a", "sha_b"],
    },
    handler=_compare_commits,
    mutating=False,
)


def build_code_tools_registry() -> ToolRegistry:
    return ToolRegistry(
        [
            CODE_GRAPH_QUERY,
            READ_FILE,
            CODE_GREP,
            ER_SCHEMA,
            CODE_METRICS,
            SEARCH_SYMBOLS,
            READ_SYMBOL,
            FIND_CALLERS,
            FIND_CALLEES,
            TRACE_PATH,
            GET_FILE_TREE,
            CALCULATE_CHANGE_IMPACT,
            FIND_API_FLOW,
            FIND_RELATED_TESTS,
            COMPARE_COMMITS,
        ]
    )
