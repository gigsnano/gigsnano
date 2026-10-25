import subprocess

from gigsnano_api.context_engine.graph.story_commits import commit_story_files


def _git(repo, *args):
    subprocess.run(
        ["git", "-c", "user.email=t@t.co", "-c", "user.name=t", *args],
        cwd=str(repo), check=True, capture_output=True, text=True,
    )


def test_commit_story_files(tmp_path):
    _git(tmp_path, "init", "-q")
    (tmp_path / "a.py").write_text("x = 1\n")
    _git(tmp_path, "add", "a.py")
    _git(tmp_path, "commit", "-q", "-m", "GIN-1 add auth service")

    (tmp_path / "b.py").write_text("y = 2\n")
    _git(tmp_path, "add", "b.py")
    _git(tmp_path, "commit", "-q", "-m", "chore: unrelated, no code")

    (tmp_path / "c.py").write_text("z = 3\n")
    _git(tmp_path, "add", "c.py")
    _git(tmp_path, "commit", "-q", "-m", "feat: thing (GIN-2)")

    pairs = commit_story_files(tmp_path, {"GIN-1", "GIN-2"})
    assert ("GIN-1", "a.py") in pairs
    assert ("GIN-2", "c.py") in pairs
    # the unrelated commit contributes nothing
    assert all(f != "b.py" for _, f in pairs)


def test_unknown_codes_ignored(tmp_path):
    _git(tmp_path, "init", "-q")
    (tmp_path / "a.py").write_text("x = 1\n")
    _git(tmp_path, "add", "a.py")
    _git(tmp_path, "commit", "-q", "-m", "ABC-9 not our project")
    assert commit_story_files(tmp_path, {"GIN-1"}) == []
