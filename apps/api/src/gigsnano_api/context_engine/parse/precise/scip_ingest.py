"""Map a SCIP index onto the structural CodeGraph, emitting precise typed edges."""

from __future__ import annotations

from gigsnano_api.context_engine.graph.model import CodeGraph, Edge

_DEFINITION = 0x1  # SymbolRole.Definition bit


def _def_line(occ) -> int:
    """1-based start line of an occurrence (SCIP ranges are 0-based)."""
    return occ.range[0] + 1


def ingest(repo_id: str, index, graph: CodeGraph) -> None:
    # SCIP emits OS-native document paths (backslashes on Windows); the structural graph
    # keys files by forward-slash relative paths. Normalise so node_for_range matches on
    # every OS — without this, on Windows nothing maps and almost no CALLS edges are found.
    def _rel(doc) -> str:
        return doc.relative_path.replace("\\", "/")

    # Pass 1: SCIP symbol string -> our node_id, via each definition's file+range.
    symbol_to_node: dict[str, str] = {}
    for doc in index.documents:
        for occ in doc.occurrences:
            if occ.symbol_roles & _DEFINITION:
                node = graph.node_for_range(_rel(doc), _def_line(occ))
                if node is not None:
                    symbol_to_node[occ.symbol] = node.node_id

    # Pass 2: references -> CALLS edge from the enclosing node to the referenced symbol.
    for doc in index.documents:
        for occ in doc.occurrences:
            if occ.symbol_roles & _DEFINITION:
                continue
            target = symbol_to_node.get(occ.symbol)
            if target is None:
                continue  # external / unresolved symbol -> drop (YAGNI in v1)
            enclosing = graph.node_for_range(_rel(doc), _def_line(occ))
            if enclosing is None or enclosing.node_id == target:
                continue
            graph.add_edge(Edge(enclosing.node_id, target, "CALLS", resolved=True))

    # Pass 3: inheritance / implementation from symbol relationships.
    for doc in index.documents:
        for sym in doc.symbols:
            src = symbol_to_node.get(sym.symbol)
            if src is None:
                continue
            for rel in sym.relationships:
                tgt = symbol_to_node.get(rel.symbol)
                if tgt is None:
                    continue
                kind = "IMPLEMENTS" if getattr(rel, "is_implementation", False) else "INHERITS"
                graph.add_edge(Edge(src, tgt, kind, resolved=True))
