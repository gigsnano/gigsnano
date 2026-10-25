
import pytest

from gigsnano_api.workspace.paths import ensure_workspace, workspace_root


def test_workspace_root_is_child_of_base(tmp_path, monkeypatch):
    monkeypatch.setattr("gigsnano_api.workspace.paths.settings.workspace_base_path", str(tmp_path))
    p = workspace_root("abc-123")
    assert p == (tmp_path / "abc-123").resolve()

@pytest.mark.parametrize("bad", ["../evil", "..", ".", "/etc/passwd", "a/../../b"])
def test_workspace_root_rejects_traversal(tmp_path, monkeypatch, bad):
    monkeypatch.setattr("gigsnano_api.workspace.paths.settings.workspace_base_path", str(tmp_path))
    with pytest.raises(ValueError):
        workspace_root(bad)

def test_workspace_root_rejects_dot(tmp_path, monkeypatch):
    monkeypatch.setattr("gigsnano_api.workspace.paths.settings.workspace_base_path", str(tmp_path))
    with pytest.raises(ValueError):
        workspace_root(".")

def test_workspace_root_accepts_uuid(tmp_path, monkeypatch):
    monkeypatch.setattr("gigsnano_api.workspace.paths.settings.workspace_base_path", str(tmp_path))
    project_id = "a1b2c3d4-0000-4abc-8def-000000000001"
    p = workspace_root(project_id)
    assert p == (tmp_path / project_id).resolve()

def test_ensure_workspace_creates_dir(tmp_path, monkeypatch):
    monkeypatch.setattr("gigsnano_api.workspace.paths.settings.workspace_base_path", str(tmp_path))
    p = ensure_workspace("proj-1")
    assert p.is_dir()
