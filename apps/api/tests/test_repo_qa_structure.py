import pytest

from gigsnano_api.agent.tools.code import _valid_sha
from gigsnano_api.context_engine.graph import queries as q
from gigsnano_api.context_engine.graph import store
from gigsnano_api.context_engine.graph.model import CodeGraph, Edge, Node, node_id


def test_valid_sha_guard():
    assert _valid_sha("a1b2c3d")
    assert _valid_sha("0" * 40)
    assert not _valid_sha("../etc")
    assert not _valid_sha("main; rm -rf")


@pytest.mark.skipif(not store.available(), reason="FalkorDB not reachable")
def test_related_tests_filters_test_paths():
    pid = "test-repo-qa-struct"
    store.drop(pid)
    g = CodeGraph()
    tgt = Node(node_id("r", "svc.py", "save"), "save", "save", "svc.py", "function", "python", 1, 3)
    test = Node(
        node_id("r", "tests/test_svc.py", "test_save"),
        "test_save",
        "test_save",
        "tests/test_svc.py",
        "function",
        "python",
        1,
        4,
    )
    other = Node(node_id("r", "api.py", "route"), "route", "route", "api.py", "function", "python", 1, 3)
    for n in (tgt, test, other):
        g.add_node(n)
    g.add_edge(Edge(test.node_id, tgt.node_id, "CALLS", resolved=True))
    g.add_edge(Edge(other.node_id, tgt.node_id, "CALLS", resolved=True))
    store.upsert_graph(pid, g)
    files = q.test_callers(pid, tgt.node_id)
    assert "tests/test_svc.py" in files and "api.py" not in files
    store.drop(pid)
