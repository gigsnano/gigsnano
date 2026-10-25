"""Resolve a fuzzy symbol reference (name / Class.method / file:name) to ranked nodes."""

from __future__ import annotations

from gigsnano_api.context_engine.graph.queries import _NODE_COLS, _query, _row_to_node


def resolve_symbol(pid: str, ref: str, limit: int = 10) -> list[dict]:
    ref = ref.strip()
    file_hint, _, name_hint = ref.rpartition(":") if ":" in ref else ("", "", ref)
    # 1) exact symbol_path
    rows = _query(pid, f"MATCH (n:Symbol) WHERE n.symbol_path = $ref RETURN {_NODE_COLS} LIMIT $l",
                  {"ref": ref, "l": limit})
    # 2) file:name
    if not rows and file_hint:
        rows = _query(
            pid,
            f"MATCH (n:Symbol) WHERE n.file_path ENDS WITH $f AND n.name = $n "
            f"RETURN {_NODE_COLS} LIMIT $l",
            {"f": file_hint, "n": name_hint, "l": limit},
        )
    # 3) case-insensitive name
    if not rows:
        rows = _query(pid, f"MATCH (n:Symbol) WHERE toLower(n.name) = $q RETURN {_NODE_COLS} LIMIT $l",
                      {"q": name_hint.lower(), "l": limit})
    # 4) CONTAINS
    if not rows:
        rows = _query(pid, f"MATCH (n:Symbol) WHERE n.symbol_path CONTAINS $q RETURN {_NODE_COLS} LIMIT $l",
                      {"q": name_hint, "l": limit})
    return [_row_to_node(r) for r in rows]
