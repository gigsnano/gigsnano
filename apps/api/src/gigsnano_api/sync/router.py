from datetime import datetime

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import async_session, get_db
from gigsnano_api.email.deps import get_email_provider
from gigsnano_api.email.provider import EmailProvider
from gigsnano_api.features.projects.schemas import ProjectOut
from gigsnano_api.models import (
    ECloneStatus,
    ESyncJobStatus,
    EWorkspaceRole,
    GitHubConnection,
    Project,
    SyncJob,
)
from gigsnano_api.shared.context import (
    WorkspaceContext,
    get_project_or_404,
    get_workspace_context,
    require_role,
)
from gigsnano_api.shared.serializers import serialize_project
from gigsnano_api.sync.github_client import (
    GitHubClient,
    GitHubConfigError,
    get_github_client,
)
from gigsnano_api.sync.github_oauth import (
    GitHubOAuth,
    GitHubOAuthError,
    decrypt_token,
    encrypt_token,
    get_github_oauth,
)
from gigsnano_api.sync.github_state import sign_state, verify_state
from gigsnano_api.workspace.clone import run_clone_in_fresh_session

router = APIRouter(tags=["sync"])

ADMINS = (EWorkspaceRole.ADMIN, EWorkspaceRole.OWNER)


class GitHubStatusOut(BaseModel):
    """Frontend IGitHubStatus."""

    connected: bool
    repo_url: str | None


class ConnectPayload(BaseModel):
    repo_name: str | None = None
    installation_id: int | None = None


async def get_connection(db: AsyncSession, workspace_id: str) -> GitHubConnection | None:
    return (
        await db.execute(
            select(GitHubConnection).where(GitHubConnection.workspace_id == workspace_id)
        )
    ).scalar_one_or_none()


@router.get("/workspaces/{workspace_slug}/github/", response_model=GitHubStatusOut)
async def github_status(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    connection = await get_connection(db, ctx.workspace.id)
    connected = connection is not None and (
        connection.access_token_encrypted is not None or connection.installation_id is not None
    )
    return GitHubStatusOut(
        connected=connected,
        repo_url=connection.repo_url if connection else None,
    )


@router.post("/workspaces/{workspace_slug}/github/connect/", response_model=GitHubStatusOut)
async def github_connect(
    payload: ConnectPayload,
    ctx: WorkspaceContext = Depends(require_role(*ADMINS)),
    db: AsyncSession = Depends(get_db),
    gh: GitHubClient = Depends(get_github_client),
):
    try:
        installation_id = payload.installation_id or await gh.resolve_installation()
        repos = await gh.list_repos(installation_id)
    except GitHubConfigError as err:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(err))

    if payload.repo_name:
        wanted = payload.repo_name.lower()
        matches = [
            r for r in repos
            if r.full_name.lower() == wanted or r.full_name.lower().endswith(f"/{wanted}")
        ]
    else:
        matches = repos[:1]
    if len(matches) != 1:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Repo not resolvable; installation has: {[r.full_name for r in repos]}",
        )
    repo = matches[0]

    connection = await get_connection(db, ctx.workspace.id)
    if connection is None:
        connection = GitHubConnection(
            workspace_id=ctx.workspace.id,
            installation_id=installation_id,
            repo_full_name=repo.full_name,
            repo_url=repo.url,
            default_branch=repo.default_branch,
        )
        db.add(connection)
    else:
        connection.installation_id = installation_id
        connection.repo_full_name = repo.full_name
        connection.repo_url = repo.url
        connection.default_branch = repo.default_branch
    await db.commit()
    return GitHubStatusOut(connected=True, repo_url=connection.repo_url)


@router.post("/workspaces/{workspace_slug}/github/disconnect/")
async def github_disconnect(
    ctx: WorkspaceContext = Depends(require_role(*ADMINS)),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    connection = await get_connection(db, ctx.workspace.id)
    if connection is not None:
        await db.delete(connection)
        await db.commit()
    return {"success": True}


class RepoOut(BaseModel):
    full_name: str
    url: str
    default_branch: str


class OAuthCallbackPayload(BaseModel):
    code: str
    state: str


@router.get("/workspaces/{workspace_slug}/github/install-url/")
async def github_authorize_url(
    ctx: WorkspaceContext = Depends(require_role(*ADMINS)),
    oauth: GitHubOAuth = Depends(get_github_oauth),
) -> dict[str, str]:
    # GitHub OAuth App authorize URL (user-authorization web flow). The frontend
    # redirects the browser here; GitHub sends the user back to the registered
    # redirect_uri with ?code=&state=. `state` is HMAC-signed with workspace+user.
    return {"url": oauth.authorize_url(sign_state(ctx.workspace.slug, ctx.user.id))}


@router.post(
    "/workspaces/{workspace_slug}/github/oauth/callback/", response_model=GitHubStatusOut
)
async def github_oauth_callback(
    payload: OAuthCallbackPayload,
    ctx: WorkspaceContext = Depends(require_role(*ADMINS)),
    db: AsyncSession = Depends(get_db),
    oauth: GitHubOAuth = Depends(get_github_oauth),
):
    # Called by the frontend callback page after GitHub's redirect. Verify the
    # signed state binds to THIS workspace + the initiating admin, then exchange
    # the code for a user token and store it Fernet-encrypted.
    try:
        ws_slug, state_user_id = verify_state(payload.state)
    except ValueError as err:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(err))
    if ws_slug != ctx.workspace.slug:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "State/workspace mismatch")
    if state_user_id != ctx.user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "State/user mismatch")
    try:
        token = await oauth.exchange_code(payload.code)
    except (GitHubOAuthError, httpx.HTTPError) as err:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"OAuth exchange failed: {err}")
    connection = await get_connection(db, ctx.workspace.id)
    if connection is None:
        connection = GitHubConnection(workspace_id=ctx.workspace.id)
        db.add(connection)
    connection.access_token_encrypted = encrypt_token(token)
    await db.commit()
    return GitHubStatusOut(connected=True, repo_url=connection.repo_url)


@router.get("/workspaces/{workspace_slug}/github/repos/", response_model=list[RepoOut])
async def github_repos(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
    oauth: GitHubOAuth = Depends(get_github_oauth),
):
    connection = await get_connection(db, ctx.workspace.id)
    if connection is None or not connection.access_token_encrypted:
        raise HTTPException(status.HTTP_409_CONFLICT, "Connect GitHub first")
    try:
        repos = await oauth.list_repos(decrypt_token(connection.access_token_encrypted))
    except (GitHubOAuthError, httpx.HTTPError) as err:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Could not list repos: {err}")
    return [RepoOut(full_name=r.full_name, url=r.url, default_branch=r.default_branch)
            for r in repos]


class LinkRepoPayload(BaseModel):
    repo_full_name: str


@router.post(
    "/workspaces/{workspace_slug}/projects/{project_id}/link-repo/",
    response_model=ProjectOut,
)
async def link_repo(
    payload: LinkRepoPayload,
    background: BackgroundTasks,
    project: Project = Depends(get_project_or_404),
    # Linking a repo triggers a clone (and enables doc sync) — an outward-facing
    # action, gated to workspace admin/owner like connect/disconnect/retry.
    ctx: WorkspaceContext = Depends(require_role(*ADMINS)),
    db: AsyncSession = Depends(get_db),
    oauth: GitHubOAuth = Depends(get_github_oauth),
):
    """Link (or change) the repository backing a project, then clone it. Mirrors
    the brownfield block of create_project so any project — greenfield or already
    linked — can pick a repo from the project's GitHub dialog."""
    connection = await get_connection(db, ctx.workspace.id)
    if connection is None or not connection.access_token_encrypted:
        raise HTTPException(status.HTTP_409_CONFLICT, "Connect GitHub first")
    try:
        repos = {
            r.full_name: r
            for r in await oauth.list_repos(decrypt_token(connection.access_token_encrypted))
        }
    except (GitHubOAuthError, httpx.HTTPError) as err:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, f"Could not list repos: {err}"
        )
    repo = repos.get(payload.repo_full_name)
    if repo is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "Repository not found in the connected account"
        )
    project.repo_full_name = repo.full_name
    project.repo_url = repo.url
    project.repo_default_branch = repo.default_branch
    project.clone_status = ECloneStatus.PENDING
    project.clone_error = None
    await db.commit()
    background.add_task(run_clone_in_fresh_session, oauth, project.id)
    return await serialize_project(db, project, ctx.workspace.slug)


@router.post(
    "/workspaces/{workspace_slug}/projects/{project_id}/clone/retry/",
    response_model=None,
    status_code=status.HTTP_202_ACCEPTED,
)
async def retry_clone(
    background: BackgroundTasks,
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(require_role(*ADMINS)),
    db: AsyncSession = Depends(get_db),
    oauth: GitHubOAuth = Depends(get_github_oauth),
) -> dict:
    if not project.repo_full_name:
        raise HTTPException(status.HTTP_409_CONFLICT, "Project has no linked repo")
    project.clone_status = ECloneStatus.PENDING
    project.clone_error = None
    await db.commit()
    background.add_task(run_clone_in_fresh_session, oauth, project.id)
    return {"id": project.id, "clone_status": project.clone_status.value}


class SyncJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    status: ESyncJobStatus
    commit_sha: str | None
    error: str | None
    files_changed: int
    created_at: datetime


async def _run_sync_in_fresh_session(
    oauth: GitHubOAuth, job_id: str, provider: EmailProvider
) -> None:
    """Background task: the request's session is closed by now — open our own."""
    from gigsnano_api.sync.service import run_sync

    async with async_session() as db:
        await run_sync(db, oauth, job_id, provider)


@router.post(
    "/workspaces/{workspace_slug}/projects/{project_id}/sync/",
    response_model=SyncJobOut,
    status_code=status.HTTP_202_ACCEPTED,
)
async def trigger_sync(
    background: BackgroundTasks,
    project: Project = Depends(get_project_or_404),
    # Pushing docs to the connected repo is a destructive/outward-facing action —
    # gate it to workspace admin/owner, consistent with connect/disconnect.
    ctx: WorkspaceContext = Depends(require_role(*ADMINS)),
    db: AsyncSession = Depends(get_db),
    oauth: GitHubOAuth = Depends(get_github_oauth),
    email_provider: EmailProvider = Depends(get_email_provider),
):
    connection = await get_connection(db, ctx.workspace.id)
    if (
        not project.repo_full_name
        or connection is None
        or not connection.access_token_encrypted
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, "Connect GitHub and link a repo first")
    job = SyncJob(project_id=project.id)
    db.add(job)
    await db.commit()
    background.add_task(_run_sync_in_fresh_session, oauth, job.id, email_provider)
    return job


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/sync/{job_id}/",
    response_model=SyncJobOut,
)
async def get_sync_job(
    job_id: str,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
):
    job = await db.get(SyncJob, job_id)
    if job is None or job.project_id != project.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sync job not found")
    return job


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/sync/",
    response_model=list[SyncJobOut],
)
async def list_sync_jobs(
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
):
    jobs = (
        await db.execute(
            select(SyncJob)
            .where(SyncJob.project_id == project.id)
            .order_by(SyncJob.created_at.desc())
            .limit(20)
        )
    ).scalars()
    return list(jobs.all())
