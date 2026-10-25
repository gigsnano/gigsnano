import pytest

from gigsnano_api.context_engine.graph import store
from gigsnano_api.context_engine.graph.model import CodeGraph, Edge, Node, node_id
from gigsnano_api.context_engine.graph.queries import search_symbols
from gigsnano_api.context_engine.graph.resolve import resolve_symbol

PID = "test-repo-qa"
pytestmark = pytest.mark.skipif(not store.available(), reason="FalkorDB not reachable")


def _seed() -> None:
    store.drop(PID)
    g = CodeGraph()
    f = Node(node_id("r", "auth/login.py", "auth/login.py"), "login.py", "auth/login.py",
             "auth/login.py", "file", "python", 1, 40)
    verify = Node(node_id("r", "auth/login.py", "verify_token"), "verify_token",
                  "verify_token", "auth/login.py", "function", "python", 42, 78)
    handler = Node(node_id("r", "auth/api.py", "login_handler"), "login_handler",
                   "login_handler", "auth/api.py", "function", "python", 10, 25)
    for n in (f, verify, handler):
        g.add_node(n)
    g.add_edge(Edge(handler.node_id, verify.node_id, "CALLS", resolved=True))
    store.upsert_graph(PID, g)


def test_search_symbols_by_name():
    _seed()
    rows = search_symbols(PID, "verify_token")
    assert any(r["symbol_path"] == "verify_token" and r["file_path"] == "auth/login.py"
               and r["start_line"] == 42 for r in rows)
    store.drop(PID)


def test_resolve_symbol_exact_then_fuzzy():
    _seed()
    exact = resolve_symbol(PID, "verify_token")
    assert exact and exact[0]["symbol_path"] == "verify_token"
    filed = resolve_symbol(PID, "auth/login.py:verify_token")
    assert filed and filed[0]["file_path"] == "auth/login.py"
    store.drop(PID)
