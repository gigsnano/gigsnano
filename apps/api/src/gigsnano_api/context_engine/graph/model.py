"""In-memory code-graph model: symbol nodes + typed edges, plus stable node ids."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field

_LABELS = {
    "file": "File",
    "class": "Class",
    "function": "Function",
    "method": "Method",
    "interface": "Interface",
    # SDLC entities (GIA-15) — same :Symbol base label + a type label, so the
    # existing upsert_graph writer + :Symbol(node_id) index handle them unchanged.
    "story": "Story",
    "epic": "Epic",
    "sprint": "Sprint",
    "document": "Document",
}


def node_id(repo_id: str, file_path: str, symbol_path: str) -> str:
    """Stable id — deliberately NOT hashing line numbers, so a symbol that shifts
    lines keeps its identity and incremental upserts stay idempotent."""
    # Identity digest, not a security primitive — usedforsecurity=False says so.
    return hashlib.sha1(
        f"{repo_id}:{file_path}:{symbol_path}".encode(), usedforsecurity=False
    ).hexdigest()


@dataclass
class Node:
    node_id: str
    name: str
    symbol_path: str
    file_path: str
    kind: str  # file | class | function | method | interface
    language: str
    start_line: int
    end_line: int
    signature: str | None = None
    degraded: bool = False


@dataclass
class Edge:
    source: str
    target: str
    kind: str  # CONTAINS | CALLS | IMPORTS | INHERITS | IMPLEMENTS | REFERENCES
    resolved: bool


@dataclass
class CodeGraph:
    nodes: dict[str, Node] = field(default_factory=dict)
    edges: list[Edge] = field(default_factory=list)
    _seen_edges: set[tuple[str, str, str]] = field(default_factory=set)
    _by_file: dict[str, list[Node]] = field(default_factory=dict)

    def add_node(self, node: Node) -> None:
        # Assumes each node_id is added at most once per CodeGraph instance --
        # a re-add with the same id would leave the cached Node in _by_file
        # stale vs. the (overwritten) entry in self.nodes.
        if node.node_id not in self.nodes:
            self._by_file.setdefault(node.file_path, []).append(node)
        self.nodes[node.node_id] = node

    def add_edge(self, edge: Edge) -> None:
        key = (edge.source, edge.kind, edge.target)
        if key in self._seen_edges:
            return
        self._seen_edges.add(key)
        self.edges.append(edge)

    def node_for_range(self, file_path: str, line: int) -> Node | None:
        """Innermost node whose [start_line, end_line] span contains `line`.

        Indexed by file so this is O(nodes-in-file), not O(total nodes) -- it's
        called once per SCIP occurrence during ingest.
        """
        best: Node | None = None
        for n in self._by_file.get(file_path, []):
            if n.start_line <= line <= n.end_line:
                if best is None or (n.end_line - n.start_line) < (best.end_line - best.start_line):
                    best = n
        return best

    def label_for(self, node: Node) -> str:
        return _LABELS.get(node.kind, "Symbol")
