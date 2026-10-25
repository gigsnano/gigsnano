"""FalkorDB adapter: one graph per project (code:{project_id})."""

from __future__ import annotations

import logging

from falkordb import FalkorDB

from gigsnano_api.context_engine.graph.model import CodeGraph
from gigsnano_api.core.config import settings

logger = logging.getLogger(__name__)
_BATCH = 1000


def graph_name(project_id: str) -> str:
    return f"code:{project_id}"


def _client() -> FalkorDB:
    return FalkorDB.from_url(settings.falkordb_url)


def available() -> bool:
    try:
        _client().connection.execute_command("GRAPH.LIST")
        return True
    except Exception:  # noqa: BLE001 - availability probe (plain Redis lacks GRAPH.LIST)
        return False


def _graph(project_id: str):
    return _client().select_graph(graph_name(project_id))


def graph_handle(project_id: str):
    """Public FalkorDB graph handle for read queries (queries.py)."""
    return _graph(project_id)


def _chunks(rows: list, size: int = _BATCH):
    for i in range(0, len(rows), size):
        yield rows[i:i + size]


def ensure_indices(project_id: str) -> None:
    """Create range indices on Symbol so node-by-node_id lookups (edge MERGE + nav
    queries) are O(log n), not full scans. Without this, edge upserts on a large graph
    do 47k-node scans per row and time out — leaving an edge-less graph (GIA-10)."""
    g = _graph(project_id)
    for prop in ("node_id", "file_path", "name"):
        try:
            g.query(f"CREATE INDEX FOR (n:Symbol) ON (n.{prop})")
        except Exception as err:  # noqa: BLE001 - index already exists → fine
            logger.debug("index on Symbol.%s not created: %s", prop, err)


def upsert_graph(project_id: str, graph: CodeGraph) -> None:
    """UNWIND-batched upsert: one query per chunk per label/kind, not per row."""
    g = _graph(project_id)
    ensure_indices(project_id)

    by_label: dict[str, list[dict]] = {}
    for n in graph.nodes.values():
        by_label.setdefault(graph.label_for(n), []).append({
            "id": n.node_id, "name": n.name, "sp": n.symbol_path, "fp": n.file_path,
            "kind": n.kind, "lang": n.language, "sl": n.start_line, "el": n.end_line,
            "deg": n.degraded,
        })
    for label, rows in by_label.items():
        for chunk in _chunks(rows):
            g.query(
                "UNWIND $rows AS row "
                f"MERGE (s:Symbol:{label} {{node_id: row.id}}) "
                "SET s.name=row.name, s.symbol_path=row.sp, s.file_path=row.fp, "
                "s.kind=row.kind, s.language=row.lang, s.start_line=row.sl, "
                "s.end_line=row.el, s.degraded=row.deg",
                params={"rows": chunk},
            )

    by_kind: dict[str, list[dict]] = {}
    for e in graph.edges:
        if e.source == e.target:
            continue
        by_kind.setdefault(e.kind, []).append({"s": e.source, "t": e.target, "res": e.resolved})
    for kind, rows in by_kind.items():
        for chunk in _chunks(rows):
            g.query(
                "UNWIND $rows AS row "
                "MATCH (a:Symbol {node_id: row.s}), (b:Symbol {node_id: row.t}) "
                f"MERGE (a)-[r:{kind}]->(b) SET r.resolved=row.res",
                params={"rows": chunk},
            )


def delete_files(project_id: str, file_paths: list[str]) -> None:
    g = _graph(project_id)
    for fp in file_paths:
        g.query("MATCH (n:Symbol {file_path:$fp}) DETACH DELETE n", params={"fp": fp})


def drop(project_id: str) -> None:
    try:
        _graph(project_id).delete()
    except Exception as err:  # noqa: BLE001 - dropping a non-existent graph is fine
        logger.debug("graph drop for project %s was a no-op: %s", project_id, err)


def count_nodes(project_id: str) -> int:
    res = _graph(project_id).query("MATCH (n:Symbol) RETURN count(n)")
    return int(res.result_set[0][0]) if res.result_set else 0


def count_edges(project_id: str) -> int:
    res = _graph(project_id).query("MATCH ()-[r]->() RETURN count(r)")
    return int(res.result_set[0][0]) if res.result_set else 0
