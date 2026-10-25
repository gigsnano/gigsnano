from pathlib import Path

from gigsnano_api.context_engine.graph.model import CodeGraph
from gigsnano_api.context_engine.parse import structural
from gigsnano_api.context_engine.parse.languages import detect, is_deep

SRC = '''\
import os
from .util import helper


class Service:
    def run(self):
        return helper()


def top_level():
    return Service().run()
'''


def _build(tmp_path: Path) -> CodeGraph:
    (tmp_path / "svc.py").write_text(SRC)
    g = CodeGraph()
    structural.parse_file("r1", tmp_path, "svc.py", g)
    return g


def test_detect_and_is_deep():
    assert detect("a/b/svc.py") == "python"
    assert is_deep("python") is True
    assert detect("README.md") is None


def test_structural_python_nodes(tmp_path):
    g = _build(tmp_path)
    kinds = {(n.symbol_path, n.kind) for n in g.nodes.values()}
    assert ("svc.py", "file") in kinds
    assert ("Service", "class") in kinds
    assert ("Service.run", "method") in kinds
    assert ("top_level", "function") in kinds


def test_structural_python_contains_and_imports(tmp_path):
    g = _build(tmp_path)
    contains = {(g.nodes[e.source].symbol_path, g.nodes[e.target].symbol_path)
                for e in g.edges if e.kind == "CONTAINS"}
    assert ("svc.py", "Service") in contains
    assert ("Service", "Service.run") in contains
    imports = [e for e in g.edges if e.kind == "IMPORTS" and not e.resolved]
    assert len(imports) >= 1  # `import os` and/or `from .util import helper`
