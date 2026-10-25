import pytest

from gigsnano_api.models import ECloneStatus, Project
from gigsnano_api.sync.github_oauth import FakeGitHubOAuth
from gigsnano_api.workspace.clone import _failure_message, _redact, clone_repo


class _RealishOAuth:
    """A non-Fake oauth so clone_repo takes the real (git) branch. clone_repo only
    isinstance-checks against FakeGitHubOAuth, so no real GitHub calls happen."""


@pytest.mark.anyio
async def test_fake_clone_marks_ready_and_creates_workspace(
    db_session, make_project, tmp_path, monkeypatch
):
    monkeypatch.setattr("gigsnano_api.workspace.paths.settings.workspace_base_path", str(tmp_path))
    project = await make_project(repo_full_name="acme/docs", clone_status=ECloneStatus.PENDING)
    await clone_repo(db_session, FakeGitHubOAuth(), project.id)
    refreshed = await db_session.get(Project, project.id)
    assert refreshed.clone_status == ECloneStatus.READY
    assert (tmp_path / project.id / "README.md").exists()


@pytest.mark.anyio
async def test_retry_clone_clears_stale_workspace_root(
    db_session, make_project, tmp_path, monkeypatch
):
    """A retry/re-clone over a previously-populated root must not nest a stale
    .git inside the fresh one — the root's contents are cleared first."""
    monkeypatch.setattr("gigsnano_api.workspace.paths.settings.workspace_base_path", str(tmp_path))
    project = await make_project(repo_full_name="acme/docs", clone_status=ECloneStatus.PENDING)

    stale_root = tmp_path / project.id
    stale_root.mkdir(parents=True)
    (stale_root / "stale.txt").write_text("leftover from a previous attempt", encoding="utf-8")
    (stale_root / ".git").mkdir()

    await clone_repo(db_session, FakeGitHubOAuth(), project.id)

    refreshed = await db_session.get(Project, project.id)
    assert refreshed.clone_status == ECloneStatus.READY
    # Auto-index now runs right after a successful clone (Task 5), which adds
    # its own `.graphify-index` dir under the workspace root alongside the
    # cloned content -- both are expected to survive the stale-root clear.
    remaining = sorted(p.name for p in stale_root.iterdir())
    assert remaining == [".graphify-index", "README.md"]


@pytest.mark.anyio
async def test_clone_failure_records_nonempty_error(
    db_session, make_project, tmp_path, monkeypatch
):
    """GIN-12: a failed clone must land FAILED with a non-empty, useful reason —
    the empty-string clone_error is what surfaced as "cloning failed" with no
    explanation. Missing GitHub connection is the real (token) branch's failure."""
    monkeypatch.setattr("gigsnano_api.workspace.paths.settings.workspace_base_path", str(tmp_path))
    project = await make_project(repo_full_name="acme/docs", clone_status=ECloneStatus.PENDING)

    await clone_repo(db_session, _RealishOAuth(), project.id)  # no GitHubConnection seeded

    refreshed = await db_session.get(Project, project.id)
    assert refreshed.clone_status == ECloneStatus.FAILED
    assert refreshed.clone_error  # never empty
    assert "connection" in refreshed.clone_error.lower()


def test_failure_message_never_empty_and_redacts():
    assert _failure_message(ValueError("")) == "ValueError"  # empty str(err) → type name
    assert _failure_message(RuntimeError("boom")) == "boom"
    redacted = _failure_message(RuntimeError("auth failed for SECRET123"), "SECRET123")
    assert "SECRET123" not in redacted and "***" in redacted


def test_redact_removes_token():
    message = _redact(
        "fatal: url https://x-access-token:SECRET123@github.com/x/y.git not found",
        "SECRET123",
    )
    assert "SECRET123" not in message
    assert "x-access-token:SECRET123@" not in message
    assert "***" in message


@pytest.mark.anyio
async def test_git_clone_uses_thread_subprocess(tmp_path, monkeypatch):
    """Windows + uvicorn --reload uses SelectorEventLoop, which cannot
    create_subprocess_exec. _git_clone must use subprocess.run in a thread."""
    import subprocess
    from pathlib import Path

    from gigsnano_api.workspace.clone import _git_clone

    calls: list[list[str]] = []

    def fake_run(args, **kwargs):
        calls.append(list(args))
        dest = args[-1]
        Path(dest).mkdir(parents=True, exist_ok=True)
        (Path(dest) / "README.md").write_text("ok", encoding="utf-8")
        return subprocess.CompletedProcess(args, 0, b"", b"")

    monkeypatch.setattr("gigsnano_api.workspace.clone.subprocess.run", fake_run)
    dest = tmp_path / "repo"
    await _git_clone("https://example.com/acme/docs.git", "main", dest)
    assert calls and calls[0][0] == "git" and "clone" in calls[0]
    assert (dest / "README.md").exists()


@pytest.mark.anyio
async def test_clone_and_swap_replaces_stubborn_nonempty_dir(tmp_path, monkeypatch):
    """GIN-371: a re-clone must replace a broken/read-only workspace even when it
    can't be emptied in place — clone into a temp dir, then swap (rename) it in."""
    import os
    import stat

    from gigsnano_api.workspace import clone as clone_mod

    final = tmp_path / "proj"
    final.mkdir()
    # A read-only 'pack' + a stub .git, simulating a headless/corrupt clone that
    # git-clone-in-place would trip over ("destination already exists, not empty").
    (final / ".git").mkdir()
    old_pack = final / ".git" / "old.pack"
    old_pack.write_text("stale")
    os.chmod(old_pack, stat.S_IREAD)

    async def fake_git_clone(remote, branch, dest, token=""):
        dest.mkdir(parents=True, exist_ok=True)
        (dest / ".git").mkdir()
        (dest / "app.py").write_text("print('fresh')\n")

    monkeypatch.setattr(clone_mod, "_git_clone", fake_git_clone)

    await clone_mod._clone_and_swap("https://example/repo.git", "main", final, token="")

    assert (final / "app.py").is_file()          # fresh clone promoted into place
    assert not (final / ".git" / "old.pack").exists()  # stubborn old tree gone
    assert not (final.parent / "proj.reclone").exists()  # temp cleaned up
    assert not (final.parent / "proj.stale").exists()    # stale cleaned up
