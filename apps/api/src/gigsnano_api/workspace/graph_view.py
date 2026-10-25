"""Pure helpers for the explorable codebase graph (Repo-Aware Plan 3).

`load_graph` reads the graphify-index output (`graph.json`, written by
Plan 1's `build_code_index`) for a project; `aggregate_communities` collapses
a large graph into community super-nodes so the frontend never has to render
an unbounded graph."""

from __future__ import annotations

import json
from collections import defaultdict

from gigsnano_api.workspace.paths import index_dir


def load_graph(project_id: str) -> dict:
    p = index_dir(project_id) / "graph.json"
    if not p.is_file():
        return {"nodes": [], "edges": []}
    return json.loads(p.read_text(encoding="utf-8"))


def _bucket(node: dict) -> str:
    src = node.get("source_file") or node.get("id") or ""
    parts = src.split("/")
    return "/".join(parts[:2]) if len(parts) > 1 else (parts[0] or "root")


def aggregate_communities(graph: dict, max_nodes: int = 5000) -> dict:
    nodes = graph.get("nodes", [])
    if len(nodes) <= max_nodes:
        return graph

    def _member(n: dict) -> str:
        c = n.get("community")
        return str(c) if c is not None and c != "" else _bucket(n)

    member = {n.get("id"): _member(n) for n in nodes}
    groups = {c for c in member.values()}
    agg_nodes = [{"id": c, "label": c, "kind": "community"} for c in sorted(groups)]
    weights: dict[tuple[str, str], int] = defaultdict(int)
    for e in graph.get("edges", []):
        a, b = member.get(e.get("source")), member.get(e.get("target"))
        if a and b and a != b:
            key = (a, b) if a < b else (b, a)
            weights[key] += 1
    agg_edges = [{"source": a, "target": b, "weight": w} for (a, b), w in weights.items()]
    return {"nodes": agg_nodes, "edges": agg_edges}
