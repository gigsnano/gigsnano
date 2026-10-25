"""Codebase Overview aggregation + honest health scoring (GIN-272).

Pure functions over the persisted artifacts (graph/metrics/issues/changes) and the
project's index-freshness columns. No fabrication is the whole point: every section
carries a `state` (available / stale / indexing / unavailable) and a `source`, a
missing analyzer yields `unavailable` rather than a passing label, and "measured
zero" is never conflated with "not measured".

Scoring is documented and deterministic:
  * architecture   = 100 − 15·(circular module-dependency groups); unavailable when
                     the graph carries no dependency edges (they weren't indexed).
  * maintainability = 100 − 1.5·max(0, worstCCN−10) − 3·max(0, dup%−3); unavailable
                     when neither complexity nor duplication was measured.
  * security       = 100 − 20·errors − 5·warnings; unavailable when semgrep didn't run.
  * test_coverage  = always unavailable — the current index measures no coverage, and
                     "no coverage data" must never read as passing.
Status band: ≥80 healthy · ≥50 warning · else critical · None → unavailable.
Overall score = mean of the available dimension scores (needs ≥2, else the section
is `partial`), so one missing analyzer can't silently prop up the number.
"""

from __future__ import annotations

from collections import defaultdict

from gigsnano_api.models import EIndexStatus

FILE_KINDS = {"file"}
SYMBOL_KINDS = {"class", "function", "method", "interface"}


# ---- state machine ---------------------------------------------------------

def section_state(status: EIndexStatus, has_data: bool, drifted: bool) -> str:
    """available / stale / indexing / unavailable for one section, from the index
    status and whether we hold any (possibly older) data for it."""
    if status == EIndexStatus.READY:
        if not has_data:
            return "unavailable"
        return "stale" if drifted else "available"
    if status in (EIndexStatus.PENDING, EIndexStatus.INDEXING):
        return "stale" if has_data else "indexing"
    return "stale" if has_data else "unavailable"  # FAILED / NONE


def _band(score: float | None) -> str:
    if score is None:
        return "unavailable"
    if score >= 80:
        return "healthy"
    if score >= 50:
        return "warning"
    return "critical"


def _clamp(x: float) -> int:
    return int(round(max(0.0, min(100.0, x))))


# ---- module grouping (mirrors the frontend moduleKeyName) ------------------

def _module_key(path: str) -> tuple[str, str]:
    segs = [s for s in path.split("/") if s]
    if segs and segs[0] == "src" and len(segs) >= 3:
        return f"src/{segs[1]}", segs[1]
    if len(segs) >= 2:
        return segs[0], segs[0]
    return "(root)", "(root)"


def _node_path(node: dict) -> str:
    return node.get("source_file") or node.get("id") or ""


def modules_from_graph(graph: dict, limit: int = 12) -> list[dict]:
    files: dict[str, set[str]] = defaultdict(set)
    symbols: dict[str, int] = defaultdict(int)
    names: dict[str, str] = {}
    for node in graph.get("nodes", []):
        path = _node_path(node)
        if not path:
            continue
        key, name = _module_key(path)
        names[key] = name
        symbols[key] += 1
        files[key].add(path)
    items = [
        {"key": key, "name": names[key], "files": len(files[key]), "symbols": symbols[key]}
        for key in symbols
    ]
    items.sort(key=lambda m: (-m["symbols"], m["name"]))
    return items[:limit]


def _module_scc_count(graph: dict) -> tuple[int, bool]:
    """(circular module-dependency groups, has_edges). Groups = strongly-connected
    components of size >1 in the module graph, via iterative Tarjan. `has_edges`
    is False when the graph carries no dependency edges — the honest signal that
    architecture can't be assessed (the fake/file-only index has none)."""
    edges = graph.get("edges", [])
    if not edges:
        return 0, False
    node_module = {n.get("id"): _module_key(_node_path(n))[0] for n in graph.get("nodes", [])}
    adj: dict[str, set[str]] = defaultdict(set)
    saw_edge = False
    for e in edges:
        a, b = node_module.get(e.get("source")), node_module.get(e.get("target"))
        if a and b and a != b:
            adj[a].add(b)
            saw_edge = True
    if not saw_edge:
        return 0, False

    index_counter = 0
    indices: dict[str, int] = {}
    low: dict[str, int] = {}
    on_stack: set[str] = set()
    stack: list[str] = []
    scc_big = 0
    for root in list(adj.keys()):
        if root in indices:
            continue
        work = [(root, iter(adj[root]))]
        while work:
            node, it = work[-1]
            if node not in indices:
                indices[node] = low[node] = index_counter
                index_counter += 1
                stack.append(node)
                on_stack.add(node)
            advanced = False
            for nxt in it:
                if nxt not in indices:
                    work.append((nxt, iter(adj[nxt])))
                    advanced = True
                    break
                if nxt in on_stack:
                    low[node] = min(low[node], indices[nxt])
            if advanced:
                continue
            if low[node] == indices[node]:
                size = 0
                while True:
                    w = stack.pop()
                    on_stack.discard(w)
                    low[w] = min(low[w], low[node])
                    size += 1
                    if w == node:
                        break
                if size > 1:
                    scc_big += 1
            work.pop()
            if work:
                parent = work[-1][0]
                low[parent] = min(low[parent], low[node])
    return scc_big, True


# ---- health dimensions -----------------------------------------------------

def _dimension(key: str, label: str, score: float | None, evidence: str, drilldown: str | None) -> dict:
    return {
        "key": key,
        "label": label,
        "status": _band(score),
        "score": None if score is None else _clamp(score),
        "evidence": evidence,
        "drilldown": drilldown,
    }


def health_from_metrics(metrics: dict | None, graph: dict | None) -> dict:
    """The four health dimensions + an overall score, all from real analyzer output."""
    metrics = metrics or {}
    graph = graph or {"nodes": [], "edges": []}

    # architecture — circular module dependencies
    scc, has_edges = _module_scc_count(graph)
    arch_score = None if not has_edges else _clamp(100 - 15 * scc)
    arch_ev = (
        "Dependency edges were not indexed for this repository."
        if not has_edges
        else "No circular dependencies between modules."
        if scc == 0
        else f"{scc} circular module-dependency group{'s' if scc != 1 else ''} detected."
    )
    architecture = _dimension("architecture", "Architecture", arch_score, arch_ev, "dependencies")

    # maintainability — worst complexity + duplication
    worst = metrics.get("complexity", {}).get("worst", []) or []
    worst_ccn = max((int(w.get("ccn", 0)) for w in worst), default=0)
    dup = metrics.get("duplication", {}).get("percent")
    measured = bool(worst) or dup is not None
    maint_score = None
    if measured:
        s = 100.0 - 1.5 * max(0, worst_ccn - 10)
        if dup is not None:
            s -= 3.0 * max(0.0, dup - 3.0)
        maint_score = _clamp(s)
    parts = []
    if worst:
        parts.append(f"worst function CCN {worst_ccn}")
    if dup is not None:
        parts.append(f"{dup:.1f}% duplication")
    maint_ev = ", ".join(parts).capitalize() if parts else "Complexity and duplication were not measured."
    maintainability = _dimension("maintainability", "Maintainability", maint_score, maint_ev, "metrics")

    # test coverage — never measured by the current index; unavailable, not passing
    test_files = sum(1 for n in graph.get("nodes", []) if _is_test(_node_path(n)))
    cov_ev = (
        "Coverage is not measured by the current index"
        + (f"; {test_files} test file{'s' if test_files != 1 else ''} present." if test_files else ".")
    )
    coverage = _dimension("test_coverage", "Test coverage", None, cov_ev, "issues")

    # security — semgrep counts (None = not scanned)
    issues_summary = metrics.get("issues")
    if issues_summary is None:
        security = _dimension("security", "Security", None, "Security scan (semgrep) did not run.", "issues")
    else:
        c = issues_summary.get("counts", {})
        err, warn = int(c.get("error", 0)), int(c.get("warning", 0))
        sec_score = _clamp(100 - 20 * err - 5 * warn)
        sec_ev = (
            "No security findings."
            if err == 0 and warn == 0
            else f"{err} error{'s' if err != 1 else ''}, {warn} warning{'s' if warn != 1 else ''}."
        )
        security = _dimension("security", "Security", sec_score, sec_ev, "issues")

    dimensions = [architecture, maintainability, coverage, security]
    avail = [d["score"] for d in dimensions if d["score"] is not None]
    score = int(round(sum(avail) / len(avail))) if len(avail) >= 2 else None
    return {"score": score, "dimensions": dimensions, "measured_dimensions": len(avail)}


def _is_test(path: str) -> bool:
    p = path.lower()
    return bool(
        "/test/" in p or "/tests/" in p
        or p.startswith("test/") or p.startswith("tests/")
        or ".test." in p or ".spec." in p or "_test." in p
        or "/test_" in p or p.startswith("test_")
    )


# ---- counts ----------------------------------------------------------------

def counts_from(graph: dict | None, metrics: dict | None) -> dict:
    graph = graph or {"nodes": [], "edges": []}
    metrics = metrics or {}
    nodes = graph.get("nodes", [])
    file_nodes = sum(1 for n in nodes if (n.get("kind") or "").lower() in FILE_KINDS)
    return {
        "files": (metrics.get("totals", {}).get("files") or file_nodes) or 0,
        "loc": metrics.get("totals", {}).get("loc"),
        "symbols": len(nodes),
        "edges": len(graph.get("edges", [])),
        "languages": len(metrics.get("languages", []) or []),
        "languages_source": metrics.get("languages_source"),
    }


# ---- risks -----------------------------------------------------------------

_SEMGREP_SEVERITY = {"ERROR": "critical", "WARNING": "medium", "INFO": "low"}


def risks_from(metrics: dict | None, issues: dict | None, detected_at: str | None) -> list[dict]:
    metrics = metrics or {}
    out: list[dict] = []
    for i in (issues or {}).get("issues", [])[:50]:
        out.append(
            {
                "id": f"sec:{i.get('rule')}:{i.get('file')}:{i.get('line')}",
                "severity": _SEMGREP_SEVERITY.get(str(i.get("severity", "")).upper(), "low"),
                "category": "security",
                "title": str(i.get("rule", "")).split(".")[-1],
                "evidence": i.get("message", ""),
                "location": f"{i.get('file')}:{i.get('line')}",
                "analyzer": "semgrep",
                "detected_at": detected_at,
            }
        )
    for h in metrics.get("hotspots", [])[:20]:
        score = h.get("hotspot", 0.0)
        out.append(
            {
                "id": f"hot:{h.get('file')}",
                "severity": "high" if score >= 0.5 else "medium" if score >= 0.2 else "low",
                "category": "hotspot",
                "title": (h.get("file") or "").split("/")[-1],
                "evidence": f"complexity {h.get('complexity')} × churn {h.get('churn')}",
                "location": h.get("file"),
                "analyzer": "lizard+git",
                "detected_at": detected_at,
            }
        )
    rank = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    out.sort(key=lambda r: (rank.get(r["severity"], 4), r["location"] or ""))
    return out


# ---- changes ---------------------------------------------------------------

def changes_from(changes: dict | None, indexed_sha: str | None) -> list[dict]:
    out = []
    for c in (changes or {}).get("commits", []):
        sha = c.get("sha", "")
        out.append(
            {
                "sha": sha,
                "short_sha": sha[:8],
                "author": c.get("author", ""),
                "message": c.get("message", ""),
                "committed_at": c.get("committed_at"),
                "is_indexed_head": bool(indexed_sha) and sha == indexed_sha,
            }
        )
    return out


# ---- assembly --------------------------------------------------------------

def _prov(state: str, source: str, built_at, detail: str | None = None) -> dict:
    return {"state": state, "source": source, "built_at": built_at, "detail": detail}


def assemble_overview(
    *,
    status: EIndexStatus,
    index_error: str | None,
    repo_full_name: str | None,
    branch: str | None,
    indexed_sha: str | None,
    indexed_at,
    head_sha: str | None = None,
    graph: dict | None,
    metrics: dict | None,
    issues: dict | None,
    changes: dict | None,
    graph_built_at=None,
    metrics_built_at=None,
    changes_built_at=None,
) -> dict:
    """Fan the persisted artifacts + freshness columns into the overview contract.
    Pure — the router does the DB reads and hands the plain data in, so the whole
    shape (and every state branch) is unit-testable without a database."""
    drifted = bool(status == EIndexStatus.READY and head_sha and indexed_sha and head_sha != indexed_sha)
    has_graph = bool(graph and graph.get("nodes"))
    has_metrics = bool(metrics)
    has_changes = bool(changes and changes.get("commits"))

    if status == EIndexStatus.FAILED:
        top = "failed"
    elif status in (EIndexStatus.PENDING, EIndexStatus.INDEXING):
        top = "indexing"
    elif status == EIndexStatus.NONE:
        top = "none"
    elif not has_graph:
        top = "empty"
    else:
        top = "stale" if drifted else "ready"

    counts_state = section_state(status, has_graph or has_metrics, drifted)
    health = health_from_metrics(metrics, graph)
    health_state = (
        section_state(status, has_metrics or has_graph, drifted)
        if health["measured_dimensions"] >= 2 or status != EIndexStatus.READY
        else "partial"
    )
    modules_state = section_state(status, has_graph, drifted)
    risks_state = section_state(status, has_metrics or bool(issues), drifted)
    changes_state = section_state(status, has_changes, drifted)

    return {
        "state": top,
        "index": {
            "status": status.value,
            "repo_full_name": repo_full_name,
            "branch": branch,
            "indexed_commit_sha": indexed_sha,
            "indexed_at": indexed_at,
            "head_commit_sha": head_sha,
            "drifted": drifted,
            "error": index_error,
        },
        "counts": {**_prov(counts_state, "index", graph_built_at), **counts_from(graph, metrics)},
        "health": {**_prov(health_state, "static-analysis", metrics_built_at), **health},
        "modules": {
            **_prov(modules_state, "index", graph_built_at),
            "items": modules_from_graph(graph or {}),
        },
        "risks": {
            **_prov(risks_state, "semgrep+lizard", metrics_built_at),
            "items": risks_from(metrics, issues, metrics_built_at),
        },
        "changes": {
            **_prov(
                changes_state,
                "git",
                changes_built_at,
                None if has_changes else "No commit history (shallow clone or empty repository).",
            ),
            "items": changes_from(changes, indexed_sha),
        },
    }
