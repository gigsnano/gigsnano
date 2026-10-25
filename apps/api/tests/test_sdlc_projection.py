import pytest

from gigsnano_api.context_engine.graph import queries, store
from gigsnano_api.context_engine.graph.model import CodeGraph, Edge, Node
from gigsnano_api.context_engine.graph.sdlc import (
    SdlcRows,
    build_sdlc_subgraph,
    sdlc_node_id,
)

pytestmark = pytest.mark.skipif(not store.available(), reason="FalkorDB not reachable")


def test_sdlc_projection_and_queries_roundtrip():
    pid = "test-gia15-roundtrip"
    store.drop(pid)  # start clean
    try:
        g = CodeGraph()
        g.add_node(Node(
            node_id="sym1", name="foo", symbol_path="foo", file_path="a.py",
            kind="function", language="py", start_line=1, end_line=2,
        ))
        rows = SdlcRows(
            stories=[{"id": "s1", "code": "T-1", "title": "S", "type": "story",
                      "parent_id": None, "cycle_id": None}],
            cycles=[], artifacts=[],
        )
        sub = build_sdlc_subgraph(rows)
        for n in sub.nodes.values():
            g.add_node(n)
        for e in sub.edges:
            g.add_edge(e)
        g.add_edge(Edge(sdlc_node_id("story", "s1"), "sym1", "STORY_MODIFIES_CODE", True))

        store.upsert_graph(pid, g)

        assert [s["code"] for s in queries.stories_for_symbol(pid, "sym1")] == ["T-1"]
        assert [s["code"] for s in queries.impacted_stories(pid, "sym1")] == ["T-1"]
        syms = queries.story_symbols(pid, sdlc_node_id("story", "s1"))
        assert [s["name"] for s in syms] == ["foo"]
    finally:
        store.drop(pid)  # never leak the test graph
