import pytest

from gigsnano_api.context_engine.graph import queries as q
from gigsnano_api.context_engine.graph import store
from gigsnano_api.context_engine.graph.model import CodeGraph, Edge, Node, node_id

PID = "test-repo-qa-cg"
pytestmark = pytest.mark.skipif(not store.available(), reason="FalkorDB not reachable")


def _seed():
    store.drop(PID)
    g = CodeGraph()

    def mk(path, sym, s, e):
        n = Node(node_id("r", path, sym), sym.split(".")[-1], sym, path, "function", "python", s, e)
        g.add_node(n)
        return n

    a = mk("api.py", "route", 1, 5)
    b = mk("svc.py", "service", 1, 5)
    c = mk("db.py", "save", 1, 5)
    g.add_edge(Edge(a.node_id, b.node_id, "CALLS", resolved=True))
    g.add_edge(Edge(b.node_id, c.node_id, "CALLS", resolved=True))
    store.upsert_graph(PID, g)
    return a, b, c


def _id(sym):
    return node_id("r", {"route": "api.py", "service": "svc.py", "save": "db.py"}[sym], sym)


def test_callers_callees():
    _seed()
    assert any(r["symbol_path"] == "route" for r in q.callers(PID, _id("service")))
    assert any(r["symbol_path"] == "save" for r in q.callees(PID, _id("service")))
    store.drop(PID)


def test_trace_path_and_impact():
    _seed()
    path = q.shortest_call_path(PID, _id("route"), _id("save"))
    assert path == ["route", "service", "save"]
    impacted = {r["symbol_path"] for r in q.change_impact(PID, _id("save"))}
    assert {"route", "service"} <= impacted  # both transitively reach save
    store.drop(PID)


def test_api_flow():
    _seed()
    flow = {r["symbol_path"] for r in q.api_flow(PID, _id("route"))}
    assert {"service", "save"} <= flow
    store.drop(PID)
