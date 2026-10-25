import shutil
import sys
from pathlib import Path

import pytest

from gigsnano_api.context_engine.graph.build import build_graph


def _repo(tmp_path: Path) -> Path:
    (tmp_path / "pkg").mkdir()
    (tmp_path / "pkg" / "svc.py").write_text(
        "class A:\n    def run(self):\n        return 1\n")
    (tmp_path / "pkg" / "main.py").write_text(
        "from .svc import A\n\ndef go():\n    return A().run()\n")
    return tmp_path


def test_build_graph_structural_only(tmp_path):
    g = build_graph("r1", _repo(tmp_path), use_scip=False)
    symbols = {n.symbol_path for n in g.nodes.values()}
    assert {"pkg/svc.py", "A", "A.run", "pkg/main.py", "go"} <= symbols
    assert any(e.kind == "CONTAINS" for e in g.edges)


def test_build_graph_incremental_file_subset(tmp_path):
    repo = _repo(tmp_path)
    g = build_graph("r1", repo, files=["pkg/svc.py"], use_scip=False)
    files = {n.file_path for n in g.nodes.values()}
    assert files == {"pkg/svc.py"}  # only the requested file parsed


# scip-python is Windows-incompatible (crashes building `new RegExp(path.sep='\\')`) and
# npm .cmd shims can't be invoked via list-form subprocess on win32 — the real precise path
# runs on Linux/CI (the prod runner image). Gate on both PATH presence and non-Windows.
@pytest.mark.skipif(
    sys.platform == "win32" or shutil.which("scip-python") is None,
    reason="scip-python unavailable or Windows-incompatible; runs on Linux/CI",
)
def test_build_graph_precise_call_edge(tmp_path):
    g = build_graph("r1", _repo(tmp_path), use_scip=True)
    resolved_calls = [e for e in g.edges if e.kind == "CALLS" and e.resolved]
    assert resolved_calls  # main.go -> A.run resolved by SCIP


def test_build_graph_excludes_build_artifact_dirs(tmp_path):
    repo = _repo(tmp_path)
    # generated build output + deps that must NOT be indexed (bloat + noise)
    (repo / ".next" / "static").mkdir(parents=True)
    (repo / ".next" / "static" / "chunk.js").write_text("function generated(){return 1}\n")
    (repo / "node_modules" / "dep").mkdir(parents=True)
    (repo / "node_modules" / "dep" / "index.js").write_text("function dep(){return 2}\n")
    g = build_graph("r1", repo, use_scip=False)
    files = {n.file_path for n in g.nodes.values()}
    assert not any(f.startswith(".next/") for f in files)
    assert not any("node_modules" in f.split("/") for f in files)
    assert "pkg/svc.py" in files  # real source still indexed


def test_build_graph_respects_gitignore(tmp_path):
    import subprocess
    repo = _repo(tmp_path)  # pkg/svc.py, pkg/main.py
    (repo / ".gitignore").write_text(".next/\n")
    (repo / ".next").mkdir()
    (repo / ".next" / "chunk.js").write_text("function gen(){return 1}\n")  # gitignored
    subprocess.run(["git", "-C", str(repo), "init", "-q"], check=True)
    subprocess.run(["git", "-C", str(repo), "add", "pkg", ".gitignore"], check=True)
    g = build_graph("r1", repo, use_scip=False)
    files = {n.file_path for n in g.nodes.values()}
    assert "pkg/svc.py" in files                            # tracked source indexed
    assert not any(f.startswith(".next/") for f in files)   # gitignored -> excluded
