import json

from gigsnano_api.context_engine.graph.model import CodeGraph, Edge, Node, node_id
from gigsnano_api.context_engine.graph.project_view import to_graph_json, write_graph_json


def _graph() -> CodeGraph:
    g = CodeGraph()
    a = Node(node_id("r", "a.py", "A"), "A", "A", "a.py", "class", "python", 1, 5)
    b = Node(node_id("r", "b.py", "go"), "go", "go", "b.py", "function", "python", 1, 3)
    g.add_node(a)
    g.add_node(b)
    g.add_edge(Edge(b.node_id, a.node_id, "CALLS", resolved=True))
    g.add_edge(Edge(a.node_id, a.node_id, "IMPORTS", resolved=False))  # self-loop, dropped
    return g


def test_projection_shape():
    out = to_graph_json(_graph())
    assert set(out) == {"nodes", "edges"}
    n = next(x for x in out["nodes"] if x["label"] == "A")
    assert n["source_file"] == "a.py" and n["kind"] == "class" and "id" in n
    # only the real CALLS edge survives; the IMPORTS self-loop is dropped
    assert len(out["edges"]) == 1
    assert out["edges"][0]["weight"] == 1


def test_write_graph_json(tmp_path):
    write_graph_json(tmp_path, _graph())
    data = json.loads((tmp_path / "graph.json").read_text())
    assert data["nodes"] and data["edges"]
