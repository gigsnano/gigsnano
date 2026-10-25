# tests/test_context_engine_model.py
from gigsnano_api.context_engine.graph.model import CodeGraph, Edge, Node, node_id


def test_node_id_is_stable_across_line_shifts():
    a = node_id("r1", "auth/login.py", "login.verify_token")
    b = node_id("r1", "auth/login.py", "login.verify_token")
    assert a == b and len(a) == 40  # sha1 hex


def test_node_id_differs_by_symbol_and_repo():
    assert node_id("r1", "a.py", "f") != node_id("r1", "a.py", "g")
    assert node_id("r1", "a.py", "f") != node_id("r2", "a.py", "f")


def test_node_for_range_returns_innermost():
    g = CodeGraph()
    file_n = Node(node_id("r", "a.py", "a"), "a.py", "a", "a.py", "file", "python", 1, 20)
    cls = Node(node_id("r", "a.py", "A"), "A", "A", "a.py", "class", "python", 3, 18)
    meth = Node(node_id("r", "a.py", "A.m"), "m", "A.m", "a.py", "method", "python", 5, 9)
    for n in (file_n, cls, meth):
        g.add_node(n)
    assert g.node_for_range("a.py", 7).symbol_path == "A.m"   # innermost wins
    assert g.node_for_range("a.py", 15).symbol_path == "A"
    assert g.node_for_range("a.py", 2).symbol_path == "a"


def test_label_for_maps_kind():
    g = CodeGraph()
    n = Node(node_id("r", "a.py", "A"), "A", "A", "a.py", "class", "python", 1, 2)
    assert g.label_for(n) == "Class"
