"""Brownfield repo digest: the cloned workspace must reach the agent's system
prompt. Runnable in isolation (`pytest --noconftest tests/test_repo_digest.py`)
so it doesn't depend on the full app fixtures."""

import asyncio
import types

import pytest

from gigsnano_api.bmad.loader import WorkflowSpec
from gigsnano_api.bmad.prompt import build_system
from gigsnano_api.core.config import settings
from gigsnano_api.models import ECloneStatus
from gigsnano_api.workspace import digest as digest_mod
from gigsnano_api.workspace.digest import build_repo_digest, repo_context_block
from gigsnano_api.workspace.paths import workspace_root


@pytest.fixture
def workspace(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "workspace_base_path", str(tmp_path))
    return tmp_path


def _seed(root):
    root.mkdir(parents=True, exist_ok=True)
    (root / "README.md").write_text("# Demo\nA sample brownfield repo.", encoding="utf-8")
    (root / "package.json").write_text('{"name":"demo"}', encoding="utf-8")
    src = root / "src"
    src.mkdir()
    (src / "index.ts").write_text("export const x = 1;", encoding="utf-8")
    git = root / ".git"
    git.mkdir()
    (git / "config").write_text("[core]", encoding="utf-8")


def test_digest_includes_tree_and_key_files_excludes_git(workspace):
    _seed(workspace_root("proj1"))
    out = build_repo_digest("proj1")

    assert "<repository_snapshot>" in out and out.endswith("</repository_snapshot>")
    # File tree lists real files but never anything under .git/
    assert "README.md" in out and "package.json" in out and "src/index.ts" in out
    assert ".git" not in out and "[core]" not in out
    # Key files are inlined in full
    assert "A sample brownfield repo." in out
    assert '{"name":"demo"}' in out


def test_digest_empty_when_no_workspace(workspace):
    assert build_repo_digest("missing-project") == ""


def test_digest_never_raises_on_bad_id(workspace):
    # Illegal id -> workspace_root raises ValueError -> digest swallows to ""
    assert build_repo_digest("../escape") == ""


def _fake_project(**kw):
    return types.SimpleNamespace(**kw)


def test_repo_context_block_gates_on_clone_status(workspace):
    _seed(workspace_root("ready1"))

    ready = _fake_project(id="ready1", clone_status=ECloneStatus.READY, repo_full_name="a/b")
    not_ready = _fake_project(id="ready1", clone_status=ECloneStatus.CLONING, repo_full_name="a/b")
    no_repo = _fake_project(id="ready1", clone_status=ECloneStatus.READY, repo_full_name=None)

    assert "<repository_snapshot>" in asyncio.run(repo_context_block(ready))
    assert asyncio.run(repo_context_block(not_ready)) == ""
    assert asyncio.run(repo_context_block(no_repo)) == ""


def test_digest_reaches_system_prompt_via_build_system():
    spec = WorkflowSpec(
        id="bmad-document-project",
        persona_name="paige",
        persona="You are Paige.",
        instructions="Document the project.",
        doc_type="document_project",
        title="Project Documentation",
        required_context=(),
    )
    digest = "<repository_snapshot>\ntree: src/index.ts\n</repository_snapshot>"
    blocks = build_system(spec, context_docs=[], extra_context=digest)

    joined = "\n".join(b["text"] for b in blocks)
    assert "You are Paige." in joined
    assert "src/index.ts" in joined  # the injected repo digest survived into the system prompt


def test_key_filenames_are_lowercased_for_matching():
    # Guard against a regression where a capitalised key file (README.MD) is missed.
    assert "readme.md" in digest_mod._KEY_FILENAMES
    assert all(name == name.lower() for name in digest_mod._KEY_FILENAMES)
