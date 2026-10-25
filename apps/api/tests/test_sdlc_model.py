from gigsnano_api.context_engine.graph.sdlc import (
    SdlcRows,
    build_sdlc_subgraph,
    sdlc_node_id,
    story_modifies_code_edges,
)


def _rows() -> SdlcRows:
    return SdlcRows(
        stories=[
            {"id": "e1", "code": "GIN-1", "title": "Epic", "type": "epic", "parent_id": None, "cycle_id": None},
            {"id": "s1", "code": "GIN-2", "title": "Story 1", "type": "story", "parent_id": "e1", "cycle_id": "c1"},
            {"id": "s2", "code": "GIN-3", "title": "Story 2", "type": "story", "parent_id": None, "cycle_id": "c1"},
        ],
        cycles=[{"id": "c1", "name": "Sprint 1"}],
        artifacts=[{"id": "a1", "doc_type": "prd", "title": "PRD", "source_story_id": "s1"}],
    )


def test_build_sdlc_subgraph_nodes():
    g = build_sdlc_subgraph(_rows())
    assert sdlc_node_id("epic", "e1") in g.nodes
    assert sdlc_node_id("story", "s1") in g.nodes
    assert sdlc_node_id("sprint", "c1") in g.nodes
    assert sdlc_node_id("document", "a1") in g.nodes
    assert len(g.nodes) == 5  # 1 epic + 2 stories + 1 sprint + 1 document


def test_build_sdlc_subgraph_edges():
    g = build_sdlc_subgraph(_rows())
    triples = {(e.kind, e.source, e.target) for e in g.edges}
    assert ("CONTAINS", sdlc_node_id("epic", "e1"), sdlc_node_id("story", "s1")) in triples
    assert ("CONTAINS", sdlc_node_id("sprint", "c1"), sdlc_node_id("story", "s1")) in triples
    assert ("CONTAINS", sdlc_node_id("sprint", "c1"), sdlc_node_id("story", "s2")) in triples
    assert ("DOCUMENTS", sdlc_node_id("document", "a1"), sdlc_node_id("story", "s1")) in triples
    assert len(g.edges) == 4


def test_sdlc_nodes_get_type_labels():
    from gigsnano_api.context_engine.graph.model import CodeGraph

    g = build_sdlc_subgraph(_rows())
    labels = {g.label_for(n) for n in g.nodes.values()}
    assert {"Story", "Epic", "Sprint", "Document"} <= labels
    assert isinstance(g, CodeGraph)


def test_story_modifies_code_edges():
    story_files = [("s1", "src/auth/auth.py"), ("s1", "src/auth/auth.py"), ("s2", "src/x.py")]
    index = {"src/auth/auth.py": ["symA", "symB"], "src/x.py": ["symC"]}
    edges = story_modifies_code_edges(story_files, lambda f: index.get(f, []))
    triples = {(e.kind, e.source, e.target) for e in edges}
    assert ("STORY_MODIFIES_CODE", sdlc_node_id("story", "s1"), "symA") in triples
    assert ("STORY_MODIFIES_CODE", sdlc_node_id("story", "s1"), "symB") in triples
    assert ("STORY_MODIFIES_CODE", sdlc_node_id("story", "s2"), "symC") in triples
    assert len(edges) == 3  # deduped despite the repeated (s1, auth.py) pair
