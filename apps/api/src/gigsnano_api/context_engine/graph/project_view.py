"""Project the rich CodeGraph down to the legacy graph.json the endpoint/tool read."""

from __future__ import annotations

import json
from pathlib import Path

from gigsnano_api.context_engine.graph.model import CodeGraph


def to_graph_json(graph: CodeGraph) -> dict:
    nodes = [
        {"id": n.node_id, "label": n.name, "source_file": n.file_path, "kind": n.kind}
        for n in graph.nodes.values()
    ]
    edges = [
        {"source": e.source, "target": e.target, "weight": 1}
        for e in graph.edges
        if e.source != e.target  # drop IMPORTS self-loop placeholders
    ]
    return {"nodes": nodes, "edges": edges}


def write_graph_json(out_dir: Path, graph: CodeGraph) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "graph.json").write_text(json.dumps(to_graph_json(graph)), encoding="utf-8")
