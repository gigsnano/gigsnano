from sqlalchemy import select

from gigsnano_api.models import (
    Artifact,
    DocSyncState,
    EArtifactStatus,
    ESyncJobStatus,
    GitHubConnection,
    Project,
    SyncJob,
    Workspace,
)
from gigsnano_api.email.provider import FakeEmailProvider
from gigsnano_api.sync.github_oauth import FakeGitHubOAuth, encrypt_token
from gigsnano_api.sync.github_state import sign_state
from gigsnano_api.sync.service import run_sync


async def seed(db_session, with_connection=True):
    ws = Workspace(slug="acme", name="Acme")
    db_session.add(ws)
    await db_session.flush()
    project = Project(
        workspace_id=ws.id, name="App", identifier="APP",
        cover_image_url="https://img.test/c.jpg",
        repo_full_name="ada/docs", repo_default_branch="main",
    )
    db_session.add(project)
    await db_session.flush()
    if with_connection:
        db_session.add(GitHubConnection(
            workspace_id=ws.id, access_token_encrypted=encrypt_token("fake-user-token"),
        ))
    db_session.add(Artifact(project_id=project.id, doc_type="prd", title="PRD",
                            content_md="# PRD", status=EArtifactStatus.FINAL))
    job = SyncJob(project_id=project.id)
    db_session.add(job)
    await db_session.commit()
    return project, job


async def test_first_sync_commits_all_files(db_session):
    project, job = await seed(db_session)
    oauth = FakeGitHubOAuth()
    await run_sync(db_session, oauth, job.id, FakeEmailProvider())

    assert job.status == ESyncJobStatus.COMPLETED
    assert job.files_changed == 1
    assert oauth.commits[0]["files"] == {"docs/prd.md": "# PRD"}
    assert oauth.commits[0]["branch"] == "main"
    assert oauth.commits[0]["repo"] == "ada/docs"

    state = (await db_session.execute(select(DocSyncState))).scalars().all()
    assert [s.path for s in state] == ["docs/prd.md"]
    assert state[0].last_commit_sha == job.commit_sha


async def test_unchanged_sync_skips_github(db_session):
    project, job = await seed(db_session)
    oauth = FakeGitHubOAuth()
    await run_sync(db_session, oauth, job.id, FakeEmailProvider())

    job2 = SyncJob(project_id=project.id)
    db_session.add(job2)
    await db_session.commit()
    await run_sync(db_session, oauth, job2.id, FakeEmailProvider())

    assert job2.status == ESyncJobStatus.COMPLETED
    assert job2.files_changed == 0
    assert len(oauth.commits) == 1  # no second commit


async def test_changed_file_syncs_only_delta(db_session):
    project, job = await seed(db_session)
    oauth = FakeGitHubOAuth()
    await run_sync(db_session, oauth, job.id, FakeEmailProvider())

    db_session.add(Artifact(project_id=project.id, doc_type="prd", title="PRD",
                            content_md="# PRD v2", version=2,
                            status=EArtifactStatus.FINAL))
    db_session.add(Artifact(project_id=project.id, doc_type="brief", title="Brief",
                            content_md="# Brief", status=EArtifactStatus.FINAL))
    job2 = SyncJob(project_id=project.id)
    db_session.add(job2)
    await db_session.commit()
    await run_sync(db_session, oauth, job2.id, FakeEmailProvider())

    assert job2.files_changed == 2
    assert set(oauth.commits[1]["files"]) == {"docs/prd.md", "docs/brief.md"}


async def test_missing_connection_fails_job(db_session):
    _, job = await seed(db_session, with_connection=False)
    oauth = FakeGitHubOAuth()
    await run_sync(db_session, oauth, job.id, FakeEmailProvider())
    assert job.status == ESyncJobStatus.FAILED
    assert "connection" in job.error.lower()


async def test_missing_repo_fails_job(db_session):
    """Project has a workspace connection but no linked repo of its own."""
    ws = Workspace(slug="acme2", name="Acme2")
    db_session.add(ws)
    await db_session.flush()
    project = Project(
        workspace_id=ws.id, name="App", identifier="APP",
        cover_image_url="https://img.test/c.jpg",
    )
    db_session.add(project)
    await db_session.flush()
    db_session.add(GitHubConnection(workspace_id=ws.id, access_token_encrypted="tok"))
    job = SyncJob(project_id=project.id)
    db_session.add(job)
    await db_session.commit()

    await run_sync(db_session, FakeGitHubOAuth(), job.id, FakeEmailProvider())
    assert job.status == ESyncJobStatus.FAILED
    assert "repo" in job.error.lower()


async def test_github_error_fails_job_with_message(db_session):
    project, job = await seed(db_session)

    class ExplodingOAuth(FakeGitHubOAuth):
        async def commit_files(self, *a, **kw):
            raise RuntimeError("boom: rate limited")

    await run_sync(db_session, ExplodingOAuth(), job.id, FakeEmailProvider())
    assert job.status == ESyncJobStatus.FAILED
    assert "boom" in job.error


async def test_sync_endpoints(app, client):
    # app fixture already forces app.state.github_oauth = FakeGitHubOAuth().
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    user_id = (await client.get("/api/auth/me/")).json()["id"]

    # Brownfield create resolves the repo via FakeGitHubOAuth.list_repos, which
    # offers acme/docs + acme/mobile-app even before any connection is stored.
    project = (await client.post("/api/workspaces/acme/projects/", json={
        "name": "App", "identifier": "APP", "flow": "existing",
        "cover_image_url": "https://img.test/c.jpg",
        "repo_full_name": "acme/docs",
    })).json()
    assert project["repo_full_name"] == "acme/docs"

    # Repo is linked but no OAuth connection/token stored yet → 409.
    res = await client.post(f"/api/workspaces/acme/projects/{project['id']}/sync/")
    assert res.status_code == 409

    state = sign_state("acme", user_id)
    connected = await client.post(
        "/api/workspaces/acme/github/oauth/callback/", json={"code": "any", "state": state}
    )
    assert connected.status_code == 200 and connected.json()["connected"] is True

    res = await client.post(f"/api/workspaces/acme/projects/{project['id']}/sync/")
    assert res.status_code == 202
    job = res.json()

    # Background task has run by the time the test client returns control.
    res = await client.get(
        f"/api/workspaces/acme/projects/{project['id']}/sync/{job['id']}/"
    )
    assert res.json()["status"] in ("queued", "running", "completed")

    jobs = (await client.get(f"/api/workspaces/acme/projects/{project['id']}/sync/")).json()
    assert len(jobs) == 1
