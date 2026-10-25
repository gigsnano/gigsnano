"""Project SDLC entities (stories/epics/sprints/documents) into the code graph.

SDLC nodes reuse the :Symbol base label (+ a type label via model._LABELS) with a
namespaced node_id (``story:{id}``), so the existing ``store.upsert_graph`` writer
and the ``:Symbol(node_id)`` index handle them unchanged. Edges between an SDLC
node and a code symbol are just ``:Symbol``→``:Symbol`` edges. GIA-15.
"""

from __future__ import annotations

from dataclasses import dataclass

from gigsnano_api.context_engine.graph.model import CodeGraph, Edge, Node


def sdlc_node_id(kind: str, pk: str) -> str:
    return f"{kind}:{pk}"


def _node(kind: str, pk: str, name: str) -> Node:
    return Node(
        node_id=sdlc_node_id(kind, pk),
        name=name,
        symbol_path=name,
        file_path="",
        kind=kind,
        language="",
        start_line=0,
        end_line=0,
    )


@dataclass
class SdlcRows:
    """Plain rows decoupled from SQLAlchemy so the builder stays pure/testable.

    stories: ``{id, code, title, type, parent_id, cycle_id}``
    cycles:  ``{id, name}``
    artifacts: ``{id, doc_type, title, source_story_id}``
    """

    stories: list[dict]
    cycles: list[dict]
    artifacts: list[dict]


def build_sdlc_subgraph(rows: SdlcRows) -> CodeGraph:
    """Assemble the SDLC node/edge subgraph from Postgres-derived rows.

    Edges: Epic-CONTAINS->Story (parent_id where the parent is an epic),
    Sprint-CONTAINS->Story (cycle_id), Document-DOCUMENTS->Story (source_story_id).
    """
    g = CodeGraph()
    story_ids = {str(s["id"]) for s in rows.stories}
    epic_ids = {str(s["id"]) for s in rows.stories if s.get("type") == "epic"}

    for s in rows.stories:
        sid = str(s["id"])
        kind = "epic" if s.get("type") == "epic" else "story"
        g.add_node(_node(kind, sid, s.get("code") or s.get("title") or sid))
    for c in rows.cycles:
        g.add_node(_node("sprint", str(c["id"]), c.get("name") or str(c["id"])))
    for a in rows.artifacts:
        g.add_node(_node("document", str(a["id"]), a.get("title") or a.get("doc_type") or str(a["id"])))

    for s in rows.stories:
        sid = str(s["id"])
        parent = s.get("parent_id")
        if parent is not None and str(parent) in epic_ids:
            g.add_edge(Edge(sdlc_node_id("epic", str(parent)), sdlc_node_id("story", sid), "CONTAINS", True))
        cyc = s.get("cycle_id")
        if cyc is not None:
            g.add_edge(Edge(sdlc_node_id("sprint", str(cyc)), sdlc_node_id("story", sid), "CONTAINS", True))

    for a in rows.artifacts:
        src = a.get("source_story_id")
        if src is not None and str(src) in story_ids:
            g.add_edge(
                Edge(sdlc_node_id("document", str(a["id"])), sdlc_node_id("story", str(src)), "DOCUMENTS", True)
            )

    return g


def story_modifies_code_edges(
    story_files: list[tuple[str, str]],
    symbol_ids_for_file,
) -> list[Edge]:
    """Turn ``(story_id, file_path)`` pairs into Story-STORY_MODIFIES_CODE->Symbol
    edges, resolving each file to its symbol node_ids via ``symbol_ids_for_file``
    (a callable ``file_path -> list[node_id]``, backed by the graph)."""
    edges: list[Edge] = []
    seen: set[tuple[str, str]] = set()
    for story_id, file_path in story_files:
        src = sdlc_node_id("story", str(story_id))
        for sym_id in symbol_ids_for_file(file_path):
            key = (src, sym_id)
            if key in seen:
                continue
            seen.add(key)
            edges.append(Edge(src, sym_id, "STORY_MODIFIES_CODE", True))
    return edges
