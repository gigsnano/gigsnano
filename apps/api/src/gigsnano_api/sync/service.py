"""Sync job execution (spec §6): materialize → diff by blob SHA → one commit of
changed files. Idempotent; never raises (failures land on the job row)."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.background import BackgroundTasks

from gigsnano_api.email.provider import EmailProvider
from gigsnano_api.features.notifications.router import notify_project_members
from gigsnano_api.models import (
    DocSyncState,
    ENotificationKind,
    ESyncJobStatus,
    GitHubConnection,
    Project,
    SyncJob,
    Workspace,
)
from gigsnano_api.sync.github_client import git_blob_sha
from gigsnano_api.sync.github_oauth import GitHubOAuth, decrypt_token
from gigsnano_api.sync.materializer import materialize


async def run_sync(
    db: AsyncSession, oauth: GitHubOAuth, job_id: str, provider: EmailProvider
) -> None:
    job = await db.get(SyncJob, job_id)
    if job is None:
        return
    job.status = ESyncJobStatus.RUNNING
    await db.commit()

    try:
        project = await db.get(Project, job.project_id)
        if project is None or not project.repo_full_name:
            raise RuntimeError("Project has no linked repo")

        connection = (
            await db.execute(
                select(GitHubConnection).where(
                    GitHubConnection.workspace_id == project.workspace_id
                )
            )
        ).scalar_one_or_none()
        if connection is None or not connection.access_token_encrypted:
            raise RuntimeError("No GitHub connection for this workspace")

        token = decrypt_token(connection.access_token_encrypted)
        branch = project.repo_default_branch or "main"

        files = await materialize(db, project)
        shas = {path: git_blob_sha(content) for path, content in files.items()}

        states = (
            (
                await db.execute(
                    select(DocSyncState).where(DocSyncState.project_id == project.id)
                )
            )
            .scalars()
            .all()
        )
        known = {s.path: s for s in states}
        changed = {
            path: files[path]
            for path, sha in shas.items()
            if path not in known or known[path].blob_sha != sha
        }

        if not changed:
            job.status = ESyncJobStatus.COMPLETED
            job.files_changed = 0
            await db.commit()
            return

        commit_sha = await oauth.commit_files(
            token,
            project.repo_full_name,
            branch,
            changed,
            f"docs: sync {project.name} planning artifacts (GigsNano)",
        )

        for path in changed:
            state = known.get(path)
            if state is None:
                state = DocSyncState(project_id=project.id, path=path, blob_sha=shas[path])
                db.add(state)
            state.blob_sha = shas[path]
            state.last_commit_sha = commit_sha
        job.status = ESyncJobStatus.COMPLETED
        job.commit_sha = commit_sha
        job.files_changed = len(changed)
        workspace = await db.get(Workspace, project.workspace_id)
        email_tasks = BackgroundTasks()
        if workspace is not None:
            await notify_project_members(
                db,
                project.workspace_id,
                project.id,
                trigger_key="github.docs_synced",
                context={"project": project.name},
                kind=ENotificationKind.SYSTEM,
                href=f"/{workspace.slug}/projects/{project.id}/settings/integrations",
                # Detached job: collect the send in a local BackgroundTasks and drain
                # it after commit. Provider is the app singleton handed down from the
                # request (FakeEmailProvider in tests).
                background=email_tasks,
                provider=provider,
            )
        await db.commit()
        await email_tasks()
    except Exception as err:  # noqa: BLE001 — background job: capture, never raise
        await db.rollback()
        job.status = ESyncJobStatus.FAILED
        job.error = str(err)
        await db.commit()
