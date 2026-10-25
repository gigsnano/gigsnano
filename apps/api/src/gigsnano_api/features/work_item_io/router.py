"""Project-scoped work-item Excel import/export (GIN-75). Reuses ExportJob/ImportJob
+ the fresh-session BackgroundTasks pattern; parsers/renderers live beside this file."""
import base64
from datetime import datetime, timedelta

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
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import get_db, utcnow
from gigsnano_api.features.work_item_io.columns import DEFAULT_KEYS
from gigsnano_api.features.work_item_io.importer import (
    run_export_fresh,
    run_import_fresh,
    validate_import,
)
from gigsnano_api.features.work_item_io.template import build_template
from gigsnano_api.models import EExportStatus, EImportStatus, ExportJob, ImportJob, Project
from gigsnano_api.shared.context import (
    WorkspaceContext,
    get_project_or_404,
    get_workspace_context,
    reject_if_project_viewer,
)

router = APIRouter(tags=["work-item-io"])
_BASE = "/workspaces/{workspace_slug}/projects/{project_id}/work-items"
_MAX = 10 * 1024 * 1024
_FORMATS = ("xlsx", "csv")
_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


class WorkItemExportPayload(BaseModel):
    columns: list[str] = Field(default_factory=lambda: list(DEFAULT_KEYS))
    format: str = "xlsx"
    scope: str = "all"                    # "all" | "view"
    filters: dict | None = None           # only when scope == "view"


class ExportJobOut(BaseModel):
    id: str
    status: str
    format: str
    download_url: str | None
    created_at: datetime


class ImportJobOut(BaseModel):
    id: str
    status: str
    summary: dict
    created_at: datetime


def _export_out(job: ExportJob, slug: str) -> ExportJobOut:
    return ExportJobOut(
        id=job.id, status=job.status.value, format=job.format,
        download_url=(f"/workspaces/{slug}/exports/{job.id}/download/"
                      if job.status == EExportStatus.READY else None),
        created_at=job.created_at)


@router.get(_BASE + "/export/template/")
async def download_template(
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
):
    return Response(
        content=build_template(), media_type=_XLSX,
        headers={"Content-Disposition": 'attachment; filename="work-items-template.xlsx"'})


@router.post(_BASE + "/export/", response_model=ExportJobOut,
             status_code=status.HTTP_201_CREATED)
async def create_export(
    payload: WorkItemExportPayload,
    background: BackgroundTasks,
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    if payload.format not in _FORMATS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "format must be xlsx or csv")
    # Store columns as given (incl. `cf:{id}` custom-field keys); the export
    # runner's `_cols` intersects payload columns against the project's
    # resolved column set, so invalid keys render nothing and cf:* keys
    # render correctly. Empty selection falls back to the static defaults.
    keys = list(payload.columns) or list(DEFAULT_KEYS)
    job = ExportJob(
        workspace_id=ctx.workspace.id, project_id=project.id,
        name=f"{project.identifier}-work-items", format=payload.format,
        status=EExportStatus.PENDING, columns=keys,
        filters=payload.filters if payload.scope == "view" else None,
        created_by=ctx.user.id, expires_at=utcnow() + timedelta(days=7))
    db.add(job)
    await db.commit()
    await db.refresh(job)
    background.add_task(run_export_fresh, db.bind, job.id)
    return _export_out(job, ctx.workspace.slug)


@router.post(_BASE + "/import/validate/")
async def validate_route(
    file: UploadFile = File(...),
    format: str = Form(...),
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    await reject_if_project_viewer(db, ctx, project.id)
    if format not in _FORMATS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "format must be xlsx or csv")
    content = await file.read()
    if len(content) > _MAX:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "File too large (10MB max)")
    return await validate_import(db, project, content, format)


@router.post(_BASE + "/import/", response_model=ImportJobOut,
             status_code=status.HTTP_201_CREATED)
async def create_import(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    format: str = Form(...),
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    await reject_if_project_viewer(db, ctx, project.id)
    if format not in _FORMATS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "format must be xlsx or csv")
    content = await file.read()
    if len(content) > _MAX:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "File too large (10MB max)")
    job = ImportJob(
        workspace_id=ctx.workspace.id, project_id=project.id, source_format=format,
        status=EImportStatus.QUEUED, raw_content=base64.b64encode(content).decode("ascii"),
        summary={}, created_by=ctx.user.id)
    db.add(job)
    await db.commit()
    await db.refresh(job)
    background.add_task(run_import_fresh, db.bind, job.id)
    return ImportJobOut(id=job.id, status=job.status.value, summary={},
                        created_at=job.created_at)


@router.get(_BASE + "/export/{export_id}/", response_model=ExportJobOut)
async def get_export_status(
    export_id: str,
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    """Project-member-accessible poll route (GIN-75 A7c) -- mirrors
    `get_import_status`: any member with project READ access can poll an
    export job they (or a teammate) started for this project. 404s if the
    job doesn't belong to THIS project, preventing cross-project/cross-
    workspace leakage."""
    job = (
        await db.execute(
            select(ExportJob).where(
                ExportJob.id == export_id, ExportJob.project_id == project.id
            )
        )
    ).scalar_one_or_none()
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Export job not found")
    return _export_out(job, ctx.workspace.slug)


@router.get(_BASE + "/import/{import_id}/", response_model=ImportJobOut)
async def get_import_status(
    import_id: str,
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    """Project-member-accessible poll route (GIN-75 A7b) -- unlike the
    workspace-admin-gated `GET /workspaces/{slug}/imports/{id}/`, any member
    with project READ access can poll a job they (or a teammate) started for
    this project. 404s if the job doesn't belong to THIS project, preventing
    cross-project/cross-workspace leakage."""
    job = (
        await db.execute(
            select(ImportJob).where(
                ImportJob.id == import_id, ImportJob.project_id == project.id
            )
        )
    ).scalar_one_or_none()
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Import job not found")
    return ImportJobOut(id=job.id, status=job.status.value, summary=job.summary or {},
                        created_at=job.created_at)
