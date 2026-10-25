"""Workspace data exports (GIN-20). CSV/JSON/XLSX are rendered asynchronously by a
BackgroundTasks job: create_export returns a PENDING job immediately and schedules
run_export_in_fresh_session, which renders + flips the job to READY (or FAILED on
error) on its own DB session (mirrors workspace/clone.py's fresh-session pattern —
see gigsnano-api-bg-session-prod-db memory for why it binds to `db.bind` rather than
the module-level `async_session()`). XLSX is stored base64-encoded in the same
`content` Text column csv/json already use (no new binary column / object storage).
Download links expire `expires_at` days after creation (410 Gone past that).
Frontend contract: src/types/integrations/export.ts + src/services/integrations/export.service.ts."""

import base64
import csv
import io
import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import Response
from openpyxl import Workbook
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import get_db, utcnow
from gigsnano_api.core.pagination import OffsetPageOut
from gigsnano_api.email.deps import get_email_provider
from gigsnano_api.email.provider import EmailProvider
from gigsnano_api.features.notifications.router import resolve_and_notify
from gigsnano_api.models import (
    EExportStatus,
    ENotificationKind,
    ExportJob,
    Project,
    Story,
    Workspace,
)
from gigsnano_api.shared.context import (
    ADMINS,
    WorkspaceContext,
    accessible_project_ids,
    get_workspace_context,
)

router = APIRouter(tags=["exports"])

_EXPORT_FORMATS = ("csv", "json", "xlsx")
_EXPORT_TTL_DAYS = 7


class ExportJobOut(BaseModel):
    id: str
    workspace_slug: str
    name: str
    format: str
    status: str
    download_url: str | None
    expires_at: datetime | None
    created_at: datetime


class CreateExportPayload(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    format: str = "csv"


def _serialize(job: ExportJob, slug: str) -> ExportJobOut:
    return ExportJobOut(
        id=job.id,
        workspace_slug=slug,
        name=job.name,
        format=job.format,
        status=job.status.value,
        download_url=(
            f"/workspaces/{slug}/exports/{job.id}/download/"
            if job.status == EExportStatus.READY
            else None
        ),
        expires_at=job.expires_at,
        created_at=job.created_at,
    )


async def _workspace_stories(
    db: AsyncSession, workspace_id: str, project_ids: list[str] | None
) -> list[Story]:
    stmt = (
        select(Story)
        .join(Project, Project.id == Story.project_id)
        .where(Project.workspace_id == workspace_id)
        .order_by(Story.sort_order)
    )
    if project_ids is not None:
        stmt = stmt.where(Story.project_id.in_(project_ids))
    return list((await db.execute(stmt)).scalars().all())


def _render_xlsx(stories: list[Story]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.append(["id", "title", "status", "priority"])
    for s in stories:
        ws.append([s.id, s.title, s.status.value, s.priority.value])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _render(stories: list[Story], fmt: str) -> str:
    """Returns the export body: a base64 string for xlsx (binary), plain text for
    csv/json. `download_export` decodes based on `job.format` — no separate flag."""
    if fmt == "xlsx":
        return base64.b64encode(_render_xlsx(stories)).decode()
    rows = [
        {
            "id": s.id,
            "title": s.title,
            "status": s.status.value,
            "priority": s.priority.value,
        }
        for s in stories
    ]
    if fmt == "json":
        return json.dumps(rows, indent=2)
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=["id", "title", "status", "priority"])
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue()


async def _run_export(
    session: AsyncSession,
    job_id: str,
    project_ids: list[str] | None,
    provider: EmailProvider,
) -> None:
    try:
        job = await session.get(ExportJob, job_id)
    except Exception:  # noqa: BLE001 — can't flip a job row we couldn't even load
        return
    if job is None:
        return
    try:
        stories = await _workspace_stories(session, job.workspace_id, project_ids)
        job.content = _render(stories, job.format)
        job.status = EExportStatus.READY
    except Exception:  # noqa: BLE001 — status carries the failure, mirror clone.py
        job.status = EExportStatus.FAILED
    try:
        await session.commit()
    except Exception:  # noqa: BLE001 — best-effort persistence only
        await session.rollback()
        return
    if job.status != EExportStatus.READY or not job.created_by:
        return
    # Notification is best-effort and must never undo the already-committed READY
    # status or escape the task — the Workspace lookup used to sit outside this
    # try and could raise unguarded (job stuck terminal-but-then-crashing-the-task).
    try:
        workspace = await session.get(Workspace, job.workspace_id)
        if workspace is None:
            return
        # This runs in a detached background task, so there's no request-scoped
        # BackgroundTasks to defer the send to — collect it in a local one and drain
        # it after commit. The provider is the app singleton, handed down from the
        # request (FakeEmailProvider in tests). `send_email_in_background` never raises.
        email_tasks = BackgroundTasks()
        await resolve_and_notify(
            session,
            job.workspace_id,
            job.created_by,
            trigger_key="export.ready",
            context={},
            kind=ENotificationKind.SYSTEM,
            href=f"/{workspace.slug}/exports/{job.id}/download/",
            triggered_by_id=job.created_by,
            background=email_tasks,
            provider=provider,
        )
        await session.commit()
        await email_tasks()
    except Exception:  # noqa: BLE001 — a notification failure must not fail the export
        await session.rollback()


async def run_export_in_fresh_session(
    bind, job_id: str, project_ids: list[str] | None, provider: EmailProvider
) -> None:
    """Fresh session bound to the request session's engine (`db.bind`) — the real
    app engine in production, the test's overridden in-memory engine in tests. Never
    raises: the job's status (READY/FAILED) carries any failure."""
    async with AsyncSession(bind=bind, expire_on_commit=False) as session:
        await _run_export(session, job_id, project_ids, provider)


@router.get("/workspaces/{workspace_slug}/exports/", response_model=OffsetPageOut[ExportJobOut])
async def list_exports(
    limit: int = 20,
    offset: int = 0,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    limit = max(1, min(limit, 100))
    offset = max(0, offset)
    conditions = [ExportJob.workspace_id == ctx.workspace.id]
    if ctx.role not in ADMINS:
        # An export is a personal snapshot — only Owner/Admin get the workspace-wide view.
        conditions.append(ExportJob.created_by == ctx.user.id)
    base = and_(*conditions)
    total = int((await db.scalar(select(func.count(ExportJob.id)).where(base))) or 0)
    rows = (
        await db.execute(
            select(ExportJob)
            .where(base)
            .order_by(ExportJob.created_at.desc())
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


@router.post(
    "/workspaces/{workspace_slug}/exports/",
    response_model=ExportJobOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_export(
    payload: CreateExportPayload,
    background: BackgroundTasks,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
    email_provider: EmailProvider = Depends(get_email_provider),
):
    if payload.format not in _EXPORT_FORMATS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "format must be csv, json, or xlsx")
    # Access snapshot taken now (at create time) and handed to the background task —
    # simpler and more correct than re-deriving workspace-role/membership later, and
    # matches "an export is a point-in-time snapshot" (see the download rule below).
    ids = await accessible_project_ids(db, ctx)
    job = ExportJob(
        workspace_id=ctx.workspace.id,
        name=payload.name.strip(),
        format=payload.format,
        status=EExportStatus.PENDING,
        created_by=ctx.user.id,
        expires_at=utcnow() + timedelta(days=_EXPORT_TTL_DAYS),
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    background.add_task(run_export_in_fresh_session, db.bind, job.id, ids, email_provider)
    return _serialize(job, ctx.workspace.slug)


@router.get("/workspaces/{workspace_slug}/exports/{export_id}/download/")
async def download_export(
    export_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    job = (
        await db.execute(
            select(ExportJob).where(
                ExportJob.id == export_id, ExportJob.workspace_id == ctx.workspace.id
            )
        )
    ).scalar_one_or_none()
    # `status` (not just `content is not None`) gates readiness: a re-rendered job
    # that failed keeps its prior content around, so status is the source of truth.
    if job is None or job.status != EExportStatus.READY or job.content is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Export not found or not ready")
    # An export is a personal snapshot — only its creator or Owner/Admin may download it.
    if job.created_by != ctx.user.id and ctx.role not in ADMINS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Export not found or not ready")
    expires_at = job.expires_at
    if expires_at is not None:
        if expires_at.tzinfo is None:  # sqlite (tests) drops tzinfo on round-trip
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if utcnow() > expires_at:
            raise HTTPException(status.HTTP_410_GONE, "Export link expired")
    if job.format == "xlsx":
        media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        content: str | bytes = base64.b64decode(job.content)
    else:
        media = "application/json" if job.format == "json" else "text/csv"
        content = job.content
    filename = f"{job.name}.{job.format}"
    return Response(
        content=content,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
