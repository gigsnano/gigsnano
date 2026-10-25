import json

import pytest
from fastapi import HTTPException

from gigsnano_api.features.code_index.router import retry_index, start_index
from gigsnano_api.models import ECloneStatus, EIndexStatus, Project
from gigsnano_api.sync.github_oauth import FakeGitHubOAuth
from gigsnano_api.workspace.clone import clone_repo
from gigsnano_api.workspace.code_index import (
    build_code_index,
    index_repo,
    run_index_in_fresh_session,
)
from gigsnano_api.workspace.paths import ensure_workspace, index_dir, workspace_root

CREATE = {
    "name": "Mobile Banking App",
    "identifier": "MBA",
    "flow": "fresh",
    "has_ui": True,
    "cover_image_url": "https://img.test/c.jpg",
}


async def _setup_ws(client):
    await client.post(
        "/api/auth/sign-up/",
        json={
            "display_name": "Ada Lovelace",
            "email": "ada@example.test",
            "password": "s3cret!",
        },
    )
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})


async def test_project_model_index_defaults(make_project):
    project = await make_project()
    assert project.index_status == EIndexStatus.NONE
    assert project.index_error is None
    assert project.indexed_commit_sha is None
    assert project.indexed_at is None


def test_index_dir_is_contained_under_project_workspace():
    root = workspace_root("proj-123")
    idx = index_dir("proj-123")
    assert idx.relative_to(root)  # index dir lives inside the project's own subtree
    assert idx.name == ".graphify-index"


def test_index_dir_rejects_illegal_project_id():
    with pytest.raises(ValueError):
        index_dir("../escape")


def test_fake_build_code_index_writes_graph_json(tmp_path):
    repo = tmp_path / "repo"
    (repo / "src").mkdir(parents=True)
    (repo / "src" / "auth.py").write_text("def login(): ...\n")
    out = tmp_path / "out"
    out.mkdir()
    build_code_index(repo, out)  # code_index_enabled defaults False -> fake
    graph = json.loads((out / "graph.json").read_text())
    assert "nodes" in graph and "edges" in graph
    assert any("auth.py" in (n.get("source_file") or n.get("id") or "") for n in graph["nodes"])


async def test_index_repo_marks_ready_when_clone_ready(db_session):
    proj = Project(
        workspace_id="w",
        name="P",
        identifier="P1",
        cover_image_url="https://img.test/c.jpg",
        flow="existing",
        clone_status=ECloneStatus.READY,
    )
    db_session.add(proj)
    await db_session.commit()
    # simulate a cloned repo on disk
    root = ensure_workspace(proj.id)
    (root / "app.py").write_text("print('hi')\n")
    await index_repo(db_session, proj.id)
    await db_session.refresh(proj)
    assert proj.index_status == EIndexStatus.READY
    assert (index_dir(proj.id) / "graph.json").exists()


async def test_index_repo_fails_gracefully_when_clone_not_ready(db_session):
    proj = Project(
        workspace_id="w",
        name="P",
        identifier="P2",
        cover_image_url="https://img.test/c.jpg",
        flow="existing",
        clone_status=ECloneStatus.NONE,
    )
    db_session.add(proj)
    await db_session.commit()
    await index_repo(db_session, proj.id)
    await db_session.refresh(proj)
    assert proj.index_status == EIndexStatus.FAILED
    assert proj.index_error  # non-empty, redacted


async def test_index_endpoint_409s_when_clone_not_ready(client):
    await _setup_ws(client)
    project = (await client.post("/api/workspaces/acme/projects/", json=CREATE)).json()
    assert project["clone_status"] == "none"
    assert project["index_status"] == "none"  # ProjectOut exposes the index fields

    res = await client.post(f"/api/workspaces/acme/projects/{project['id']}/index/")
    assert res.status_code == 409

    retry_res = await client.post(f"/api/workspaces/acme/projects/{project['id']}/index/retry/")
    assert retry_res.status_code == 409


# The HTTP roundtrip (via `client`) runs `background.add_task` inline through
# the real BackgroundTasks machinery, whose target (`run_index_in_fresh_session`)
# opens its own session against the module-level *production* engine (not this
# test's sqlite override -- see `_dispose_module_engine` in conftest.py). So,
# exactly like `test_tree_reheals_ready_project_with_missing_files` in
# test_workspace_files.py, drive the router functions directly with the
# `background_tasks_stub` fixture + this test's own `db_session` -- deterministic,
# hermetic, and it still exercises the real endpoint logic (just not the ASGI
# transport plumbing already covered by the 409 test above).
async def test_start_index_schedules_task_and_sets_pending(
    make_project, db_session, background_tasks_stub, tmp_path, monkeypatch
):
    monkeypatch.setattr("gigsnano_api.workspace.paths.settings.workspace_base_path", str(tmp_path))
    project = await make_project(clone_status=ECloneStatus.READY)
    ensure_workspace(project.id).joinpath("app.py").write_text("print('hi')\n")

    result = await start_index(background=background_tasks_stub, project=project, db=db_session)

    assert result.project_id == project.id
    assert result.index_status == "pending"
    assert project.index_status == EIndexStatus.PENDING
    assert len(background_tasks_stub.tasks) == 1
    fn, args, _ = background_tasks_stub.tasks[0]
    assert fn is run_index_in_fresh_session
    assert args == (project.id,)

    # Run the scheduled task against this test's own session (not a fresh one
    # against the real engine) to prove it drives the project to READY.
    await index_repo(db_session, project.id)
    await db_session.refresh(project)
    assert project.index_status == EIndexStatus.READY
    assert (index_dir(project.id) / "graph.json").exists()


async def test_retry_index_schedules_task_and_sets_pending(
    make_project, db_session, background_tasks_stub
):
    project = await make_project(
        clone_status=ECloneStatus.READY,
        index_status=EIndexStatus.FAILED,
        index_error="boom",
    )

    result = await retry_index(background=background_tasks_stub, project=project, db=db_session)

    assert result.index_status == "pending"
    assert project.index_status == EIndexStatus.PENDING
    assert project.index_error is None
    assert len(background_tasks_stub.tasks) == 1


async def test_start_index_409s_when_clone_not_ready(
    make_project, db_session, background_tasks_stub
):
    project = await make_project(clone_status=ECloneStatus.NONE)
    with pytest.raises(HTTPException) as exc_info:
        await start_index(background=background_tasks_stub, project=project, db=db_session)
    assert exc_info.value.status_code == 409
    assert background_tasks_stub.tasks == []


async def test_parse_dbml_endpoint_returns_parsed_schema(client):
    await _setup_ws(client)
    project = (await client.post("/api/workspaces/acme/projects/", json=CREATE)).json()

    res = await client.post(
        f"/api/workspaces/acme/projects/{project['id']}/code/parse-dbml/",
        json={"dbml": "Table t {\n  id int [pk]\n}\n"},
    )

    assert res.status_code == 200
    body = res.json()
    assert body["tables"][0]["name"] == "t"


async def test_clone_auto_triggers_index(db_session, make_project, tmp_path, monkeypatch):
    """Reaching READY on clone should chain straight into indexing (no separate
    index call needed) -- mirrors the clone happy-path in test_brownfield_clone.py."""
    monkeypatch.setattr("gigsnano_api.workspace.paths.settings.workspace_base_path", str(tmp_path))
    monkeypatch.setattr("gigsnano_api.workspace.code_index.head_commit_sha", lambda _p: "feedcafe1234")
    project = await make_project(repo_full_name="acme/docs", clone_status=ECloneStatus.PENDING)

    await clone_repo(db_session, FakeGitHubOAuth(), project.id)

    await db_session.refresh(project)
    assert project.clone_status == ECloneStatus.READY
    assert project.index_status == EIndexStatus.READY
    assert (index_dir(project.id) / "graph.json").exists()


async def test_reindex_reclones_when_git_missing(db_session, make_project, tmp_path, monkeypatch):
    """Re-index self-heals a persistent-but-empty workspace: when the on-disk tree
    isn't a git clone, resync re-clones from GitHub before indexing (the /codebase
    Re-index that silently produced an empty graph on Azure's mounted-but-empty folder)."""
    monkeypatch.setattr("gigsnano_api.workspace.paths.settings.workspace_base_path", str(tmp_path))
    project = await make_project(repo_full_name="acme/docs", clone_status=ECloneStatus.READY)
    monkeypatch.setattr("gigsnano_api.workspace.code_index.head_commit_sha", lambda _p: "feedcafe1234")
    root = ensure_workspace(project.id)  # exists but empty — no .git
    assert not (root / ".git").is_dir()

    await index_repo(db_session, project.id, resync=True, oauth=FakeGitHubOAuth())

    await db_session.refresh(project)
    assert project.index_status == EIndexStatus.READY
    # the (simulated) re-clone repopulated the workspace before indexing
    assert (root / "README.md").is_file()
    assert (index_dir(project.id) / "graph.json").exists()


async def test_reindex_leaves_valid_clone_untouched(db_session, make_project, tmp_path, monkeypatch):
    """A valid on-disk clone (.git present) must NOT be wiped by resync — only a
    missing/empty tree triggers a re-clone, so a good clone is never clobbered."""
    monkeypatch.setattr("gigsnano_api.workspace.paths.settings.workspace_base_path", str(tmp_path))
    project = await make_project(repo_full_name="acme/docs", clone_status=ECloneStatus.READY)
    root = ensure_workspace(project.id)
    monkeypatch.setattr("gigsnano_api.workspace.code_index.head_commit_sha", lambda _p: "feedcafe1234")
    (root / ".git").mkdir()  # pretend it's a real clone
    (root / "app.py").write_text("print('hi')\n")

    await index_repo(db_session, project.id, resync=True, oauth=FakeGitHubOAuth())

    await db_session.refresh(project)
    assert project.index_status == EIndexStatus.READY
    assert (root / "app.py").is_file()  # existing clone preserved
    assert not (root / "README.md").exists()  # populate_workspace never ran


async def test_reindex_reclones_when_git_headless(db_session, make_project, tmp_path, monkeypatch):
    """GIN-371: a .git that's present but headless (no resolvable HEAD) is a broken
    clone (wiped/partial replica), not a shallow one — resync must re-clone it rather
    than index a repo it can't pin to a commit and then fail 'HEAD could not be read'."""
    monkeypatch.setattr("gigsnano_api.workspace.paths.settings.workspace_base_path", str(tmp_path))
    project = await make_project(repo_full_name="acme/docs", clone_status=ECloneStatus.READY)
    root = ensure_workspace(project.id)
    (root / ".git").mkdir()  # present but headless — no HEAD resolves
    (root / "app.py").write_text("print('hi')\n")

    # HEAD unreadable on the broken clone (the guard's first call), readable after
    # the re-clone (so the index can pin a commit and reach READY).
    calls = {"n": 0}

    def fake_head(_p):
        calls["n"] += 1
        return None if calls["n"] == 1 else "feedcafe1234"

    monkeypatch.setattr("gigsnano_api.workspace.code_index.head_commit_sha", fake_head)

    await index_repo(db_session, project.id, resync=True, oauth=FakeGitHubOAuth())

    await db_session.refresh(project)
    assert project.index_status == EIndexStatus.READY
    assert (root / "README.md").is_file()  # the re-clone ran — headless .git was healed
    assert project.indexed_commit_sha == "feedcafe1234"


# --- GIN-363: index status/commit persistence after re-index -----------------


async def _repo_backed(db_session, **kw):
    proj = Project(
        workspace_id="w",
        name="P",
        identifier="P9",
        cover_image_url="https://img.test/c.jpg",
        flow="existing",
        repo_full_name="acme/onserve",
        clone_status=ECloneStatus.READY,
        **kw,
    )
    db_session.add(proj)
    await db_session.commit()
    root = ensure_workspace(proj.id)
    (root / "app.py").write_text("print('hi')\n")
    return proj


async def test_ready_requires_a_commit_sha_for_a_repo_backed_project(db_session, monkeypatch):
    """A repo-backed project must not reach READY with a null commit (GIN-363).

    head_commit_sha returns None when the workspace isn't a live clone; flipping
    READY anyway is what left `indexed_commit_sha` null and the UI showing
    "Indexed unknown". That is a failure, not a success.
    """
    monkeypatch.setattr(
        "gigsnano_api.workspace.code_index.head_commit_sha", lambda _p: None
    )
    proj = await _repo_backed(db_session)

    await index_repo(db_session, proj.id)
    await db_session.refresh(proj)

    assert proj.index_status == EIndexStatus.FAILED
    assert proj.indexed_commit_sha is None
    assert "re-index" in (proj.index_error or "").lower()


async def test_successful_reindex_clears_interrupted_error_and_pins_the_commit(
    db_session, monkeypatch
):
    """The reported scenario: an interrupted run leaves FAILED + a stale error and
    a null sha; a successful re-index must clear all of it atomically."""
    from datetime import datetime, timezone

    stale = datetime(2026, 1, 1, tzinfo=timezone.utc)
    proj = await _repo_backed(
        db_session,
        index_status=EIndexStatus.FAILED,
        index_error="Indexing was interrupted by a server restart. Re-index to retry.",
        indexed_commit_sha=None,
        indexed_at=stale,
    )
    monkeypatch.setattr(
        "gigsnano_api.workspace.code_index.head_commit_sha", lambda _p: "abc1234def"
    )

    await index_repo(db_session, proj.id)
    await db_session.refresh(proj)

    assert proj.index_status == EIndexStatus.READY
    assert proj.index_error is None
    assert proj.indexed_commit_sha == "abc1234def"
    # SQLite returns naive datetimes; normalise before comparing to the aware stub.
    got = proj.indexed_at
    if got.tzinfo is None:
        got = got.replace(tzinfo=timezone.utc)
    assert got > stale


async def test_non_repo_backed_project_may_be_ready_without_a_sha(db_session, monkeypatch):
    """The guard is repo-backed only: a scratch/fresh project has no HEAD to pin
    and must still index. Regression against over-tightening the check."""
    monkeypatch.setattr(
        "gigsnano_api.workspace.code_index.head_commit_sha", lambda _p: None
    )
    proj = Project(
        workspace_id="w",
        name="P",
        identifier="P8",
        cover_image_url="https://img.test/c.jpg",
        flow="fresh",
        clone_status=ECloneStatus.READY,
    )
    db_session.add(proj)
    await db_session.commit()
    (ensure_workspace(proj.id) / "app.py").write_text("x=1\n")

    await index_repo(db_session, proj.id)
    await db_session.refresh(proj)
    assert proj.index_status == EIndexStatus.READY
