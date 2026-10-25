import json
import subprocess
from pathlib import Path

from gigsnano_api.context_engine.index import build_context_index, changed_files, index_incremental


def _git(repo: Path, *args: str) -> str:
    return subprocess.run(["git", *args], cwd=repo, capture_output=True, text=True,
                          check=True).stdout.strip()


def _repo(tmp_path: Path) -> Path:
    repo = tmp_path / "repo"
    repo.mkdir()
    _git(repo, "init", "-q")
    _git(repo, "config", "user.email", "t@t.test")
    _git(repo, "config", "user.name", "t")
    (repo / "a.py").write_text("def foo():\n    return 1\n")
    (repo / "b.py").write_text("def bar():\n    return 2\n")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "init")
    return repo


def test_changed_files_lists_added_and_deleted(tmp_path):
    repo = _repo(tmp_path)
    sha = _git(repo, "rev-parse", "HEAD")
    (repo / "b.py").unlink()
    (repo / "a.py").write_text("\n\ndef foo():\n    return 99\n")  # line-shift + edit
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "change")
    changed, deleted = changed_files(repo, sha)
    assert "a.py" in changed and "b.py" in deleted


def test_incremental_keeps_node_id_across_line_shift(tmp_path):
    repo = _repo(tmp_path)
    out = tmp_path / "out"
    build_context_index(repo, out, project_id="p1")  # full
    before = {n["label"]: n["id"] for n in json.loads((out / "graph.json").read_text())["nodes"]}
    sha = _git(repo, "rev-parse", "HEAD")
    (repo / "a.py").write_text("\n\n\ndef foo():\n    return 1\n")  # shift foo down 3 lines
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "shift")
    assert index_incremental(repo, out, "p1", sha) is True
    after = {n["label"]: n["id"] for n in json.loads((out / "graph.json").read_text())["nodes"]}
    assert after["foo"] == before["foo"]  # stable id despite the line shift
    assert "bar" in after  # untouched file retained


def test_incremental_drops_deleted_file(tmp_path):
    repo = _repo(tmp_path)
    out = tmp_path / "out"
    build_context_index(repo, out, project_id="p1")
    sha = _git(repo, "rev-parse", "HEAD")
    (repo / "b.py").unlink()
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "rm b")
    index_incremental(repo, out, "p1", sha)
    labels = {n["label"] for n in json.loads((out / "graph.json").read_text())["nodes"]}
    assert "bar" not in labels and "foo" in labels


def test_rename_drops_orphan_under_old_path(tmp_path):
    repo = _repo(tmp_path)
    out = tmp_path / "out"
    build_context_index(repo, out, project_id="p1")
    sha = _git(repo, "rev-parse", "HEAD")
    _git(repo, "mv", "a.py", "renamed.py")
    _git(repo, "commit", "-qm", "rename a to renamed")
    changed, deleted = changed_files(repo, sha)
    assert "a.py" in deleted and "renamed.py" in changed
    assert index_incremental(repo, out, "p1", sha) is True
    nodes = json.loads((out / "graph.json").read_text())["nodes"]
    assert not any(n.get("source_file") == "a.py" or "a.py" in n["id"] for n in nodes)
    assert any(n.get("source_file") == "renamed.py" for n in nodes)


def test_incremental_falls_back_to_full_rebuild_when_scip_enabled(tmp_path, monkeypatch):
    repo = _repo(tmp_path)
    out = tmp_path / "out"
    build_context_index(repo, out, project_id="p1")
    sha = _git(repo, "rev-parse", "HEAD")
    (repo / "a.py").write_text("def foo():\n    return 42\n")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "edit a")
    monkeypatch.setattr("gigsnano_api.context_engine.index.settings.context_engine_enabled", True)
    assert index_incremental(repo, out, "p1", sha) is False
