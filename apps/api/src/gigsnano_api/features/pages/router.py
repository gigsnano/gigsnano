"""Project wiki pages (TipTap HTML content). Mirrors the frontend page.service.
Content is stored via the GIN-300 dual-write seam (`build_content` / `read_content`)."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy import update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.content.fields import build_content, parse_content_format, read_content
from gigsnano_api.core.config import settings
from gigsnano_api.core.db import get_db
from gigsnano_api.features.pages.schemas import (
    CreatePagePayload,
    PageOut,
    PagePresenceHeartbeat,
    PagePresenceOut,
    PagePresenceViewer,
    UpdatePagePayload,
)
from gigsnano_api.models import Page, Project
from gigsnano_api.shared.context import (
    WorkspaceContext,
    get_project_or_404,
    get_workspace_context,
    require_project_write_access,
)

router = APIRouter(tags=["pages"])

_P = "/workspaces/{workspace_slug}/projects/{project_id}"

# GIN-24 presence v1: who's viewing/editing a page right now. Deliberately NOT a
# CRDT/websocket stack (see docs/superpowers/plans/2026-07-10-gin24-realtime-pages.md
# decision c) -- just a short-TTL heartbeat so the UI can show avatars + a soft
# "X is editing" advisory instead of silently clobbering saves.
# ponytail: in-proc map, move to Redis only if we ever run >1 API replica.
_PRESENCE_TTL = timedelta(seconds=20)
_presence: dict[str, dict[str, tuple[str, str | None, bool, datetime]]] = {}

_CONFLICT_MSG = "This page was changed by someone else. Reload before saving."


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(dt: datetime) -> datetime:
    # SQLite (tests) round-trips DateTime(timezone=True) as naive; Postgres (prod)
    # keeps it aware. Both are logically UTC (written via `utcnow()`), so normalize
    # before comparing rather than let a dialect quirk raise/mismatch.
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def _prune_presence(page_id: str) -> dict[str, tuple[str, str | None, bool, datetime]]:
    viewers = _presence.get(page_id)
    if not viewers:
        return {}
    cutoff = _now() - _PRESENCE_TTL
    for user_id in [uid for uid, (*_rest, seen) in viewers.items() if seen < cutoff]:
        del viewers[user_id]
    if not viewers:
        # No one's left watching this page -- drop the outer key too, or `_presence`
        # grows one permanent empty dict per distinct page ever heartbeated.
        del _presence[page_id]
        return {}
    return viewers


def _presence_out(page_id: str) -> PagePresenceOut:
    viewers = _prune_presence(page_id)
    return PagePresenceOut(
        viewers=[
            PagePresenceViewer(
                user_id=uid, display_name=name, avatar_url=avatar, editing=editing, last_seen=seen
            )
            for uid, (name, avatar, editing, seen) in viewers.items()
        ]
    )


def _content_values(raw_content: str, content_format: str | None) -> dict:
    written = build_content(
        raw_content,
        content_format=parse_content_format(content_format, default="html"),
        write_json=settings.content_json_write,
        source="editor",
    )
    return {"content": written.html, "content_json": written.json}


def _page_out(p: Page, slug: str) -> PageOut:
    resolved = read_content(
        p.content_json, p.content, read_json=settings.content_json_read
    )
    return PageOut(
        id=p.id, workspace_slug=slug, project_id=p.project_id, title=p.title,
        content=resolved.html, content_format="html",
        created_at=p.created_at, updated_at=p.updated_at,
    )


async def _page_or_404(db: AsyncSession, project: Project, page_id: str) -> Page:
    page = await db.get(Page, page_id)
    if page is None or page.project_id != project.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Page not found")
    return page


@router.get(f"{_P}/pages/", response_model=list[PageOut])
async def list_pages(
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            select(Page).where(Page.project_id == project.id).order_by(Page.created_at)
        )
    ).scalars()
    return [_page_out(p, ctx.workspace.slug) for p in rows.all()]


@router.post(f"{_P}/pages/", response_model=PageOut, status_code=status.HTTP_201_CREATED)
async def create_page(
    payload: CreatePagePayload,
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    cols = _content_values(payload.content, payload.content_format)
    page = Page(project_id=project.id, title=payload.title.strip(), **cols)
    db.add(page)
    await db.commit()
    await db.refresh(page)
    return _page_out(page, ctx.workspace.slug)


@router.get(f"{_P}/pages/{{page_id}}/", response_model=PageOut)
async def get_page(
    page_id: str,
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    page = await _page_or_404(db, project, page_id)
    return _page_out(page, ctx.workspace.slug)


@router.patch(f"{_P}/pages/{{page_id}}/", response_model=PageOut)
async def update_page(
    page_id: str,
    payload: UpdatePagePayload,
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    page = await _page_or_404(db, project, page_id)
    changes = payload.model_dump(exclude_unset=True)
    if_updated_at = changes.pop("if_updated_at", None)
    content_format = changes.pop("content_format", None)

    values: dict = {}
    if changes.get("title") is not None:
        values["title"] = changes["title"].strip()
    if changes.get("content") is not None:
        values.update(_content_values(changes["content"], content_format))

    if if_updated_at is None:
        for k, v in values.items():
            setattr(page, k, v)
        if values:
            await db.commit()
        return _page_out(page, ctx.workspace.slug)

    if not values:
        # Nothing to change -- just validate the guard against the current row.
        if _as_utc(if_updated_at) != _as_utc(page.updated_at):
            raise HTTPException(status.HTTP_409_CONFLICT, _CONFLICT_MSG)
        return _page_out(page, ctx.workspace.slug)

    # Atomic match-and-update: two concurrent PATCHes each holding their own
    # AsyncSession (and thus their own stale `page.updated_at`) can't both pass a
    # Python-side check-then-act compare. Pushing the compare into the WHERE clause
    # makes only the first writer's UPDATE match; the second gets rowcount == 0.
    result = await db.execute(
        sa_update(Page)
        .where(Page.id == page_id, Page.updated_at == _as_utc(if_updated_at))
        .values(**values)
    )
    if result.rowcount == 0:
        raise HTTPException(status.HTTP_409_CONFLICT, _CONFLICT_MSG)
    await db.commit()
    await db.refresh(page)
    return _page_out(page, ctx.workspace.slug)


@router.delete(f"{_P}/pages/{{page_id}}/", status_code=status.HTTP_204_NO_CONTENT)
async def delete_page(
    page_id: str,
    project: Project = Depends(require_project_write_access),
    db: AsyncSession = Depends(get_db),
) -> None:
    page = await _page_or_404(db, project, page_id)
    await db.delete(page)
    await db.commit()
    return None


@router.get(f"{_P}/pages/{{page_id}}/presence/", response_model=PagePresenceOut)
async def get_page_presence(
    page_id: str,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
):
    """List currently-active viewers/editors of this page (no heartbeat)."""
    await _page_or_404(db, project, page_id)
    return _presence_out(page_id)


@router.post(f"{_P}/pages/{{page_id}}/presence/", response_model=PagePresenceOut)
async def heartbeat_page_presence(
    page_id: str,
    payload: PagePresenceHeartbeat,
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    """Record "I'm here" (+ optionally "I'm editing") and return the live list."""
    await _page_or_404(db, project, page_id)
    _presence.setdefault(page_id, {})[ctx.user.id] = (
        ctx.user.display_name, ctx.user.avatar_url, payload.editing, _now()
    )
    return _presence_out(page_id)
