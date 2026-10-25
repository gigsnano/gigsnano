import pytest

from gigsnano_api.context_engine.graph import store
from gigsnano_api.context_engine.graph.model import CodeGraph, Edge, Node, node_id


def test_graph_name_scoped_per_project():
    assert store.graph_name("proj-1") == "code:proj-1"


@pytest.mark.skipif(not store.available(), reason="FalkorDB not reachable")
def test_upsert_and_delete_roundtrip():
    pid = "test-proj-store"
    store.drop(pid)
    g = CodeGraph()
    a = Node(node_id("r", "a.py", "A"), "A", "A", "a.py", "class", "python", 1, 5)
    b = Node(node_id("r", "b.py", "go"), "go", "go", "b.py", "function", "python", 1, 3)
    g.add_node(a)
    g.add_node(b)
    g.add_edge(Edge(b.node_id, a.node_id, "CALLS", resolved=True))
    store.upsert_graph(pid, g)
    assert store.count_nodes(pid) == 2
    store.delete_files(pid, ["a.py"])
    assert store.count_nodes(pid) == 1
    store.drop(pid)


@pytest.mark.skipif(not store.available(), reason="FalkorDB not reachable")
def test_upsert_graph_batches_multiple_kinds():
    """Multiple node kinds + multiple edge kinds must all land, not just the
    first of each UNWIND group -- proves the batching groups correctly."""
    pid = "test-proj-store-batch"
    store.drop(pid)
    g = CodeGraph()
    file_n = Node(node_id("r", "a.py", "a"), "a.py", "a", "a.py", "file", "python", 1, 20)
    cls = Node(node_id("r", "a.py", "A"), "A", "A", "a.py", "class", "python", 3, 18)
    meth = Node(node_id("r", "a.py", "A.m"), "m", "A.m", "a.py", "method", "python", 5, 9)
    # Second node of the same kind ("method") as `meth` above, so the node-side
    # `by_label` group for "Method" has 2+ rows -- exercises multi-row node
    # UNWIND batching the same way the edge-side CONTAINS group already does.
    meth2 = Node(node_id("r", "a.py", "A.n"), "n", "A.n", "a.py", "method", "python", 10, 14)
    for n in (file_n, cls, meth, meth2):
        g.add_node(n)
    g.add_edge(Edge(file_n.node_id, cls.node_id, "CONTAINS", resolved=True))
    g.add_edge(Edge(cls.node_id, meth.node_id, "CONTAINS", resolved=True))
    g.add_edge(Edge(cls.node_id, meth2.node_id, "CONTAINS", resolved=True))
    g.add_edge(Edge(meth.node_id, cls.node_id, "CALLS", resolved=True))
    store.upsert_graph(pid, g)
    assert store.count_nodes(pid) == 4
    assert store.count_edges(pid) == 4
    store.drop(pid)
