import pytest
from sqlalchemy.exc import IntegrityError

from gigsnano_api.models import (
    DocSyncState,
    ECommitMode,
    ESyncJobStatus,
    GitHubConnection,
    Project,
    SyncJob,
    Workspace,
)


async def seed(db_session):
    ws = Workspace(slug="acme", name="Acme")
    db_session.add(ws)
    await db_session.flush()
    project = Project(workspace_id=ws.id, name="App", identifier="APP",
                      cover_image_url="https://img.test/c.jpg")
    db_session.add(project)
    await db_session.flush()
    return ws, project


async def test_connection_defaults_and_one_per_workspace(db_session):
    ws, _ = await seed(db_session)
    conn = GitHubConnection(workspace_id=ws.id, installation_id=42,
                            repo_full_name="acme/docs",
                            repo_url="https://github.com/acme/docs")
    db_session.add(conn)
    await db_session.commit()
    assert conn.commit_mode == ECommitMode.DIRECT
    assert conn.default_branch == "main"

    db_session.add(GitHubConnection(workspace_id=ws.id, installation_id=43,
                                    repo_full_name="acme/other",
                                    repo_url="https://github.com/acme/other"))
    with pytest.raises(IntegrityError):
        await db_session.commit()


async def test_sync_job_defaults(db_session):
    _, project = await seed(db_session)
    job = SyncJob(project_id=project.id)
    db_session.add(job)
    await db_session.commit()
    assert job.status == ESyncJobStatus.QUEUED
    assert job.commit_sha is None and job.error is None and job.files_changed == 0


async def test_doc_sync_state_unique_per_path(db_session):
    _, project = await seed(db_session)
    db_session.add(DocSyncState(project_id=project.id, path="docs/prd.md", blob_sha="a" * 40))
    await db_session.commit()
    db_session.add(DocSyncState(project_id=project.id, path="docs/prd.md", blob_sha="b" * 40))
    with pytest.raises(IntegrityError):
        await db_session.commit()
