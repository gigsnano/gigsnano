from gigsnano_api.models import ECloneStatus
from gigsnano_api.sync.github_oauth import FakeGitHubOAuth
from gigsnano_api.workspace.files_router import get_workspace_tree
from gigsnano_api.workspace.paths import workspace_root

CREATE = {
    "name": "Docs Import", "identifier": "DOC", "flow": "fresh",
    "has_ui": True, "cover_image_url": "https://img.test/c.jpg",
}


async def setup_project(client, tmp_path, monkeypatch):
    monkeypatch.setattr(
        "gigsnano_api.workspace.paths.settings.workspace_base_path", str(tmp_path)
    )
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    res = await client.post("/api/workspaces/acme/projects/", json=CREATE)
    return res.json()


def write_workspace_files(project_id):
    root = workspace_root(project_id)
    (root / "docs").mkdir(parents=True)
    (root / "README.md").write_bytes(b"# Hello\n")
    (root / "docs" / "prd.md").write_bytes(b"# PRD\n")
    git_dir = root / ".git"
    git_dir.mkdir()
    (git_dir / "config").write_bytes(b"[core]\n")
    return root


async def test_tree_returns_files_excludes_git(client, tmp_path, monkeypatch):
    project = await setup_project(client, tmp_path, monkeypatch)
    write_workspace_files(project["id"])

    res = await client.get(
        f"/api/workspaces/acme/projects/{project['id']}/workspace/tree/"
    )
    assert res.status_code == 200
    entries = res.json()
    paths = {e["path"] for e in entries}

    assert "README.md" in paths
    assert "docs" in paths
    assert "docs/prd.md" in paths
    assert not any(p == ".git" or p.startswith(".git/") for p in paths)

    readme = next(e for e in entries if e["path"] == "README.md")
    assert readme["is_dir"] is False
    assert readme["size"] == len("# Hello\n".encode("utf-8"))

    docs_dir = next(e for e in entries if e["path"] == "docs")
    assert docs_dir["is_dir"] is True
    assert docs_dir["size"] is None

    # POSIX separators regardless of host OS.
    assert all("\\" not in p for p in paths)


async def test_tree_empty_when_workspace_dir_missing(client, tmp_path, monkeypatch):
    project = await setup_project(client, tmp_path, monkeypatch)
    res = await client.get(
        f"/api/workspaces/acme/projects/{project['id']}/workspace/tree/"
    )
    assert res.status_code == 200
    assert res.json() == []


async def test_file_returns_content(client, tmp_path, monkeypatch):
    project = await setup_project(client, tmp_path, monkeypatch)
    write_workspace_files(project["id"])

    res = await client.get(
        f"/api/workspaces/acme/projects/{project['id']}/workspace/file/",
        params={"path": "docs/prd.md"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["path"] == "docs/prd.md"
    assert body["content"] == "# PRD\n"


async def test_file_rejects_traversal(client, tmp_path, monkeypatch):
    project = await setup_project(client, tmp_path, monkeypatch)
    write_workspace_files(project["id"])

    res = await client.get(
        f"/api/workspaces/acme/projects/{project['id']}/workspace/file/",
        params={"path": "../../etc/passwd"},
    )
    assert res.status_code == 400


async def test_file_missing_returns_404(client, tmp_path, monkeypatch):
    project = await setup_project(client, tmp_path, monkeypatch)
    write_workspace_files(project["id"])

    res = await client.get(
        f"/api/workspaces/acme/projects/{project['id']}/workspace/file/",
        params={"path": "does-not-exist.md"},
    )
    assert res.status_code == 404


# --- Self-heal: a brownfield project the DB still marks READY but whose cloned
# files vanished (ephemeral container storage wiped on redeploy/restart). The
# tree endpoint must detect the divergence, flip status back to PENDING, and
# re-schedule the clone so the client repolls and repopulates.


async def test_tree_reheals_ready_project_with_missing_files(
    make_project, db_session, background_tasks_stub, tmp_path, monkeypatch
):
    monkeypatch.setattr(
        "gigsnano_api.workspace.paths.settings.workspace_base_path", str(tmp_path)
    )
    project = await make_project(
        repo_full_name="acme/docs", clone_status=ECloneStatus.READY
    )
    # No workspace dir on disk — the clone's files are gone.
    result = await get_workspace_tree(
        background=background_tasks_stub,
        project=project,
        db=db_session,
        oauth=FakeGitHubOAuth(),
    )

    assert result == []
    assert project.clone_status == ECloneStatus.PENDING
    assert len(background_tasks_stub.tasks) == 1
    fn, args, _ = background_tasks_stub.tasks[0]
    assert args[1] == project.id


async def test_tree_does_not_reheal_when_files_present(
    make_project, db_session, background_tasks_stub, tmp_path, monkeypatch
):
    monkeypatch.setattr(
        "gigsnano_api.workspace.paths.settings.workspace_base_path", str(tmp_path)
    )
    project = await make_project(
        repo_full_name="acme/docs", clone_status=ECloneStatus.READY
    )
    write_workspace_files(project.id)

    result = await get_workspace_tree(
        background=background_tasks_stub,
        project=project,
        db=db_session,
        oauth=FakeGitHubOAuth(),
    )

    paths = {e.path for e in result}
    assert "README.md" in paths
    assert project.clone_status == ECloneStatus.READY
    assert background_tasks_stub.tasks == []


async def test_tree_does_not_reheal_greenfield_project(
    make_project, db_session, background_tasks_stub, tmp_path, monkeypatch
):
    """A fresh (no-repo) project legitimately has no files — never re-clone it."""
    monkeypatch.setattr(
        "gigsnano_api.workspace.paths.settings.workspace_base_path", str(tmp_path)
    )
    project = await make_project(repo_full_name=None, clone_status=ECloneStatus.READY)

    result = await get_workspace_tree(
        background=background_tasks_stub,
        project=project,
        db=db_session,
        oauth=FakeGitHubOAuth(),
    )

    assert result == []
    assert background_tasks_stub.tasks == []


async def test_tree_self_heal_recovers_after_ephemeral_wipe(
    make_project, db_session, background_tasks_stub, tmp_path, monkeypatch
):
    """End-to-end reproduction of the production bug: a brownfield clone succeeds
    (READY + files), the container's ephemeral disk is wiped on redeploy, and the
    tree request self-heals by re-cloning so the workspace repopulates."""
    from gigsnano_api.workspace.clone import clone_repo

    monkeypatch.setattr(
        "gigsnano_api.workspace.paths.settings.workspace_base_path", str(tmp_path)
    )
    project = await make_project(
        repo_full_name="acme/docs", clone_status=ECloneStatus.PENDING
    )

    # Initial clone (keyless simulation) writes README.md and flips to READY.
    await clone_repo(db_session, FakeGitHubOAuth(), project.id)
    assert project.clone_status == ECloneStatus.READY
    assert (workspace_root(project.id) / "README.md").exists()

    # Ephemeral wipe: the container was recycled, files gone, DB still READY.
    import shutil

    shutil.rmtree(workspace_root(project.id))

    # Tree request sees the divergence: returns empty, flips to PENDING, and
    # schedules a re-clone.
    result = await get_workspace_tree(
        background=background_tasks_stub,
        project=project,
        db=db_session,
        oauth=FakeGitHubOAuth(),
    )
    assert result == []
    assert project.clone_status == ECloneStatus.PENDING
    assert len(background_tasks_stub.tasks) == 1

    # Running the scheduled clone repopulates the workspace.
    await clone_repo(db_session, FakeGitHubOAuth(), project.id)
    assert project.clone_status == ECloneStatus.READY
    assert (workspace_root(project.id) / "README.md").exists()


async def test_tree_does_not_reheal_while_clone_in_progress(
    make_project, db_session, background_tasks_stub, tmp_path, monkeypatch
):
    """A brownfield project mid-clone (PENDING) has no files yet — the empty tree
    is expected and must not spawn a second, competing clone."""
    monkeypatch.setattr(
        "gigsnano_api.workspace.paths.settings.workspace_base_path", str(tmp_path)
    )
    project = await make_project(
        repo_full_name="acme/docs", clone_status=ECloneStatus.PENDING
    )

    result = await get_workspace_tree(
        background=background_tasks_stub,
        project=project,
        db=db_session,
        oauth=FakeGitHubOAuth(),
    )

    assert result == []
    assert project.clone_status == ECloneStatus.PENDING
    assert background_tasks_stub.tasks == []
