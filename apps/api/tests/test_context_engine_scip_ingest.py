from gigsnano_api.context_engine.graph.model import CodeGraph, Node, node_id
from gigsnano_api.context_engine.parse.precise import scip_ingest
from gigsnano_api.context_engine.parse.precise import scip_pb2 as scip


def _seed_graph() -> CodeGraph:
    g = CodeGraph()
    # caller `top_level` at util.py lines 10-11; callee `helper` at helper.py lines 1-2
    g.add_node(Node(node_id("r", "util.py", "top_level"), "top_level", "top_level",
                    "util.py", "function", "python", 10, 11))
    g.add_node(Node(node_id("r", "helper.py", "helper"), "helper", "helper",
                    "helper.py", "function", "python", 1, 2))
    return g


def _index() -> scip.Index:
    idx = scip.Index()
    # helper.py: definition of symbol "H"
    d = idx.documents.add(relative_path="helper.py")
    occ_def = d.occurrences.add(symbol="H", symbol_roles=1)  # Definition bit
    occ_def.range.extend([0, 4, 10])  # line 0 (=structural line 1), within helper's span
    # util.py: a reference to "H" inside top_level (line 9 == structural line 10)
    u = idx.documents.add(relative_path="util.py")
    occ_ref = u.occurrences.add(symbol="H", symbol_roles=0)  # reference
    occ_ref.range.extend([9, 11, 17])
    return idx


def test_scip_ingest_emits_resolved_call_edge():
    g = _seed_graph()
    scip_ingest.ingest("r", _index(), g)
    calls = [e for e in g.edges if e.kind == "CALLS" and e.resolved]
    assert len(calls) == 1
    e = calls[0]
    assert g.nodes[e.source].symbol_path == "top_level"
    assert g.nodes[e.target].symbol_path == "helper"
