import json
from pathlib import Path

from gigsnano_api.context_engine.index import build_context_index


def _repo(tmp_path: Path) -> Path:
    d = tmp_path / "repo"
    d.mkdir()
    (d / "a.py").write_text("class A:\n    def run(self):\n        return 1\n")
    return d


def test_build_context_index_writes_graph_json(tmp_path):
    repo, out = _repo(tmp_path), tmp_path / "out"
    build_context_index(repo, out, project_id="p1")  # context_engine_enabled defaults False
    data = json.loads((out / "graph.json").read_text())
    labels = {n["label"] for n in data["nodes"]}
    assert {"a.py", "A", "run"} <= labels  # richer than the old file-only graph
