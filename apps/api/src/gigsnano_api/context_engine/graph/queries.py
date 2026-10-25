"""Read-only Cypher over a project's FalkorDB symbol graph. Returns plain dicts."""

from __future__ import annotations

from gigsnano_api.context_engine.graph import store
from gigsnano_api.core.config import settings

_NODE_COLS = "n.node_id, n.name, n.symbol_path, n.file_path, n.kind, n.start_line, n.end_line"


def _row_to_node(row: list) -> dict:
    return {
        "node_id": row[0], "name": row[1], "symbol_path": row[2],
        "file_path": row[3], "kind": row[4], "start_line": row[5], "end_line": row[6],
    }


def _query(pid: str, cypher: str, params: dict) -> list[list]:
    # ro_query (GRAPH.RO_QUERY) is read-only and actually enforces the server-side TIMEOUT;
    # a plain query() runs in write mode where the timeout isn't reliably honored. The cap
    # (ms) aborts a runaway traversal and raises instead of hanging; the runner turns that
    # into a graceful tool result.
    res = store.graph_handle(pid).ro_query(
        cypher, params=params, timeout=settings.context_engine_query_timeout_ms
    )
    return res.result_set or []


def search_symbols(pid: str, q: str, kind: str | None = None, limit: int = 25) -> list[dict]:
    ql = q.lower()
    kind_clause = " AND n.kind = $kind" if kind else ""
    rows = _query(
        pid,
        f"MATCH (n:Symbol) WHERE (toLower(n.name) = $ql OR n.symbol_path CONTAINS $q){kind_clause} "
        f"RETURN {_NODE_COLS} LIMIT $limit",
        {"ql": ql, "q": q, "kind": kind, "limit": limit},
    )
    return [_row_to_node(r) for r in rows]


def node_by_id(pid: str, node_id: str) -> dict | None:
    rows = _query(pid, f"MATCH (n:Symbol {{node_id:$id}}) RETURN {_NODE_COLS}", {"id": node_id})
    return _row_to_node(rows[0]) if rows else None


def callers(pid: str, node_id: str, limit: int = 50) -> list[dict]:
    return [
        _row_to_node(r)
        for r in _query(
            pid,
            f"MATCH (c:Symbol)-[:CALLS]->(s:Symbol {{node_id:$id}}) "
            f"RETURN DISTINCT {_NODE_COLS.replace('n.', 'c.')} LIMIT $l",
            {"id": node_id, "l": limit},
        )
    ]


def callees(pid: str, node_id: str, limit: int = 50) -> list[dict]:
    return [
        _row_to_node(r)
        for r in _query(
            pid,
            f"MATCH (s:Symbol {{node_id:$id}})-[:CALLS]->(c:Symbol) "
            f"RETURN DISTINCT {_NODE_COLS.replace('n.', 'c.')} LIMIT $l",
            {"id": node_id, "l": limit},
        )
    ]


def shortest_call_path(pid: str, a_id: str, b_id: str) -> list[str]:
    # FalkorDB only allows shortestPath() in a WITH/RETURN clause, not inline in MATCH.
    rows = _query(
        pid,
        "MATCH (a:Symbol {node_id:$a}), (b:Symbol {node_id:$b}) "
        "WITH shortestPath((a)-[:CALLS*..8]->(b)) AS p "
        "RETURN [x IN nodes(p) | x.symbol_path]",
        {"a": a_id, "b": b_id},
    )
    return rows[0][0] if rows and rows[0][0] else []


def change_impact(pid: str, node_id: str, depth: int = 5, limit: int = 100) -> list[dict]:
    return [
        _row_to_node(r)
        for r in _query(
            pid,
            f"MATCH (c:Symbol)-[:CALLS*1..{depth}]->(s:Symbol {{node_id:$id}}) "
            f"RETURN DISTINCT {_NODE_COLS.replace('n.', 'c.')} LIMIT $l",
            {"id": node_id, "l": limit},
        )
    ]


def api_flow(pid: str, entry_id: str, depth: int = 6, limit: int = 60) -> list[dict]:
    return [
        _row_to_node(r)
        for r in _query(
            pid,
            f"MATCH (e:Symbol {{node_id:$id}})-[:CALLS*1..{depth}]->(x:Symbol) "
            f"RETURN DISTINCT {_NODE_COLS.replace('n.', 'x.')} LIMIT $l",
            {"id": entry_id, "l": limit},
        )
    ]


def file_paths(pid: str, prefix: str | None = None, limit: int = 500) -> list[str]:
    where = "WHERE n.file_path STARTS WITH $p " if prefix else ""
    rows = _query(
        pid,
        f"MATCH (n:Symbol {{kind:'file'}}) {where}RETURN n.file_path ORDER BY n.file_path LIMIT $l",
        {"p": prefix or "", "l": limit},
    )
    return [r[0] for r in rows]


def test_callers(pid: str, node_id: str, limit: int = 50) -> list[str]:
    # ponytail: FalkorDB rejects `=~` regex (ResponseError: "does not currently
    # support =~"); toLower()+CONTAINS covers the test|spec heuristic just as well.
    rows = _query(
        pid,
        "MATCH (c:Symbol)-[:CALLS]->(s:Symbol {node_id:$id}) "
        "WHERE toLower(c.file_path) CONTAINS 'test' OR toLower(c.file_path) CONTAINS 'spec' "
        "RETURN DISTINCT c.file_path LIMIT $l",
        {"id": node_id, "l": limit},
    )
    return [r[0] for r in rows]


def symbols_in_files(pid: str, files: list[str], limit: int = 200) -> list[dict]:
    return [
        _row_to_node(r)
        for r in _query(
            pid,
            f"MATCH (n:Symbol) WHERE n.file_path IN $files AND n.kind <> 'file' "
            f"RETURN {_NODE_COLS} LIMIT $l",
            {"files": files, "l": limit},
        )
    ]


# --- SDLC traversal (GIA-15) ---------------------------------------------------


def stories_for_symbol(pid: str, node_id: str, limit: int = 25) -> list[dict]:
    """Stories that directly modify this symbol (its commits touched the file)."""
    rows = _query(
        pid,
        "MATCH (s:Story)-[:STORY_MODIFIES_CODE]->(:Symbol {node_id:$id}) "
        "RETURN DISTINCT s.node_id, s.name LIMIT $l",
        {"id": node_id, "l": limit},
    )
    return [{"node_id": r[0], "code": r[1]} for r in rows]


def impacted_stories(pid: str, node_id: str, depth: int = 3, limit: int = 40) -> list[dict]:
    """Business-context impact: stories owning any symbol that (transitively) calls
    the target — i.e. "which stories are affected if this code changes". depth 0 of
    the CALLS hop includes the target's own owners."""
    rows = _query(
        pid,
        f"MATCH (s:Story)-[:STORY_MODIFIES_CODE]->(c:Symbol)-[:CALLS*0..{depth}]->"
        f"(:Symbol {{node_id:$id}}) "
        f"RETURN DISTINCT s.node_id, s.name LIMIT $l",
        {"id": node_id, "l": limit},
    )
    return [{"node_id": r[0], "code": r[1]} for r in rows]


def story_symbols(pid: str, story_node_id: str, limit: int = 200) -> list[dict]:
    return [
        _row_to_node(r)
        for r in _query(
            pid,
            f"MATCH (:Story {{node_id:$id}})-[:STORY_MODIFIES_CODE]->(c:Symbol) "
            f"RETURN DISTINCT {_NODE_COLS.replace('n.', 'c.')} LIMIT $l",
            {"id": story_node_id, "l": limit},
        )
    ]


def trace_chain(pid: str, story_node_id: str) -> dict:
    """PRD/doc → Story → code: the traceability chain rooted at a story node."""
    docs = _query(
        pid,
        "MATCH (d:Document)-[:DOCUMENTS]->(:Story {node_id:$id}) RETURN d.node_id, d.name",
        {"id": story_node_id},
    )
    return {
        "documents": [{"node_id": r[0], "name": r[1]} for r in docs],
        "symbols": story_symbols(pid, story_node_id, limit=100),
    }
