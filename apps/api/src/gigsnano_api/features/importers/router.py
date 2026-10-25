"""Plane->GigsNano import jobs. Mirrors `features/exports/router.py`'s shape
(OffsetPageOut pagination, WorkspaceContext/ADMINS auth) but the upload is
multipart and processing runs as a background task (exports are synchronous)."""

import base64
import json
import logging
from datetime import datetime

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.engine import Engine
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from gigsnano_api.core.db import get_db
from gigsnano_api.core.pagination import OffsetPageOut
from gigsnano_api.features.importers.service import run_import
from gigsnano_api.models import EImportStatus, GitHubConnection, ImportJob, Project
from gigsnano_api.shared.context import ADMINS, WorkspaceContext, get_workspace_context
from gigsnano_api.sync.github_issues import fetch_issues, map_issue
from gigsnano_api.sync.token_crypto import decrypt_token

router = APIRouter(tags=["importers"])

_MAX_UPLOAD_BYTES = 10 * 1024 * 1024
_SUPPORTED_FORMATS = ("csv", "json", "xlsx")


class ImportJobOut(BaseModel):
    id: str
    workspace_slug: str
    source_format: str
    status: str
    summary: dict
    created_at: datetime


def _serialize(job: ImportJob, slug: str) -> ImportJobOut:
    return ImportJobOut(
        id=job.id,
        workspace_slug=slug,
        source_format=job.source_format,
        status=job.status.value,
        summary=job.summary or {},
        created_at=job.created_at,
    )


def _require_admin(ctx: WorkspaceContext) -> None:
    if ctx.role not in ADMINS:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Owner/Admin only")


async def run_import_in_fresh_session(bind: AsyncEngine | Engine, job_id: str) -> None:
    """Background-task wrapper: fresh session bound to the request's engine
    (never the module-level `async_session()` — that hits prod under tests)."""
    try:
        async with AsyncSession(bind=bind, expire_on_commit=False) as session:
            await run_import(session, job_id)
    except Exception:  # noqa: BLE001 — last-resort: the fresh-session setup itself blew up
        try:
            async with AsyncSession(bind=bind, expire_on_commit=False) as session:
                job = await session.get(ImportJob, job_id)
                if job is not None:
                    job.status = EImportStatus.FAILED
                    job.summary = {"errors": [{"row": "job", "reason": "import task crashed"}]}
                    await session.commit()
        except Exception:  # noqa: BLE001 — nothing further can be done
            # Logged, not swallowed: a background job that dies silently is
            # indistinguishable from one that never ran (GIN-124 fallout).
            logging.getLogger(__name__).exception(
                "could not mark import job %s failed", job_id
            )


@router.post(
    "/workspaces/{workspace_slug}/imports/",
    response_model=ImportJobOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_import(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    format: str = Form(...),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(ctx)
    if format not in _SUPPORTED_FORMATS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "format must be csv, json, or xlsx")

    content = await file.read()
    if len(content) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "File too large (10MB max)")

    job = ImportJob(
        workspace_id=ctx.workspace.id,
        source_format=format,
        status=EImportStatus.QUEUED,
        raw_content=base64.b64encode(content).decode("ascii"),
        summary={},
        created_by=ctx.user.id,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    background_tasks.add_task(run_import_in_fresh_session, db.bind, job.id)
    return _serialize(job, ctx.workspace.slug)


@router.get("/workspaces/{workspace_slug}/imports/", response_model=OffsetPageOut[ImportJobOut])
async def list_imports(
    limit: int = 20,
    offset: int = 0,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(ctx)
    limit = max(1, min(limit, 100))
    offset = max(0, offset)
    base = ImportJob.workspace_id == ctx.workspace.id
    total = int((await db.scalar(select(func.count(ImportJob.id)).where(base))) or 0)
    rows = (
        await db.execute(
            select(ImportJob)
            .where(base)
            .order_by(ImportJob.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).scalars().all()
    return OffsetPageOut(
        items=[_serialize(j, ctx.workspace.slug) for j in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/workspaces/{workspace_slug}/imports/{import_id}/",
    response_model=ImportJobOut,
)
async def get_import(
    import_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(ctx)
    job = (
        await db.execute(
            select(ImportJob).where(
                ImportJob.id == import_id, ImportJob.workspace_id == ctx.workspace.id
            )
        )
    ).scalar_one_or_none()
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Import job not found")
    return _serialize(job, ctx.workspace.slug)


# --- GitHub-issues importer (GIN-23b) --------------------------------------
# Reuses the same ImportJob row/status machinery above (source_format="github")
# instead of an uploaded file; auth reuses the workspace's existing GitHubConnection.


class GitHubImportPayload(BaseModel):
    owner: str
    repo: str
    project_id: str


class GitHubPreviewOut(BaseModel):
    issue_count: int
    label_count: int
    assignee_count: int


async def _connected_github_token(ctx: WorkspaceContext, db: AsyncSession) -> str:
    connection = (
        await db.execute(
            select(GitHubConnection).where(GitHubConnection.workspace_id == ctx.workspace.id)
        )
    ).scalar_one_or_none()
    if connection is None or not connection.access_token_encrypted:
        raise HTTPException(status.HTTP_409_CONFLICT, "Connect GitHub first")
    return decrypt_token(connection.access_token_encrypted)


@router.get(
    "/workspaces/{workspace_slug}/imports/github/preview/", response_model=GitHubPreviewOut
)
async def preview_github_import(
    owner: str,
    repo: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    """Dry-run: fetch + map without persisting anything, for the wizard's
    pre-confirm counts (issue/label/distinct-assignee)."""
    _require_admin(ctx)
    token = await _connected_github_token(ctx, db)
    try:
        issues = await fetch_issues(token, owner, repo)
    except Exception as err:  # noqa: BLE001 — surface as a 422, not a 500
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Could not fetch issues: {err}")
    mapped = [map_issue(i) for i in issues]
    labels = {name for m in mapped for name in m["labels"]}
    assignees = {m["assignee_login"] for m in mapped if m["assignee_login"]}
    return GitHubPreviewOut(
        issue_count=len(mapped), label_count=len(labels), assignee_count=len(assignees)
    )


@router.post(
    "/workspaces/{workspace_slug}/imports/github/",
    response_model=ImportJobOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_github_import(
    payload: GitHubImportPayload,
    background_tasks: BackgroundTasks,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(ctx)
    await _connected_github_token(ctx, db)  # 409 early if GitHub isn't connected
    project = await db.get(Project, payload.project_id)
    if project is None or project.workspace_id != ctx.workspace.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")

    job = ImportJob(
        workspace_id=ctx.workspace.id,
        source_format="github",
        status=EImportStatus.QUEUED,
        raw_content=json.dumps(
            {"owner": payload.owner, "repo": payload.repo, "project_id": payload.project_id}
        ),
        summary={},
        created_by=ctx.user.id,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    background_tasks.add_task(run_import_in_fresh_session, db.bind, job.id)
    return _serialize(job, ctx.workspace.slug)
