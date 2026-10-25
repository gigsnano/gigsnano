"""Workspace sticky notes (shared across members). Mirrors sticky.service."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import get_db
from gigsnano_api.features.stickies.schemas import (
    CreateStickyPayload,
    StickyOut,
    UpdateStickyPayload,
)
from gigsnano_api.models import Sticky
from gigsnano_api.shared.context import WorkspaceContext, get_workspace_context

router = APIRouter(tags=["stickies"])

_W = "/workspaces/{workspace_slug}"


def _out(s: Sticky, slug: str) -> StickyOut:
    return StickyOut(id=s.id, workspace_slug=slug, body=s.body, color=s.color,
                     created_at=s.created_at, updated_at=s.updated_at)


async def _sticky_or_404(db: AsyncSession, ctx: WorkspaceContext, sticky_id: str) -> Sticky:
    s = await db.get(Sticky, sticky_id)
    if s is None or s.workspace_id != ctx.workspace.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sticky not found")
    return s


@router.get(f"{_W}/stickies/", response_model=list[StickyOut])
async def list_stickies(ctx: WorkspaceContext = Depends(get_workspace_context),
                        db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(Sticky).where(Sticky.workspace_id == ctx.workspace.id).order_by(Sticky.created_at)
    )).scalars()
    return [_out(s, ctx.workspace.slug) for s in rows.all()]


@router.post(f"{_W}/stickies/", response_model=StickyOut, status_code=status.HTTP_201_CREATED)
async def create_sticky(payload: CreateStickyPayload,
                        ctx: WorkspaceContext = Depends(get_workspace_context),
                        db: AsyncSession = Depends(get_db)):
    sticky = Sticky(workspace_id=ctx.workspace.id, body=payload.body.strip(), color=payload.color)
    db.add(sticky)
    await db.commit()
    await db.refresh(sticky)
    return _out(sticky, ctx.workspace.slug)


@router.patch(f"{_W}/stickies/{{sticky_id}}/", response_model=StickyOut)
async def update_sticky(sticky_id: str, payload: UpdateStickyPayload,
                        ctx: WorkspaceContext = Depends(get_workspace_context),
                        db: AsyncSession = Depends(get_db)):
    sticky = await _sticky_or_404(db, ctx, sticky_id)
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("body") is not None:
        sticky.body = changes["body"].strip()
    if changes.get("color") is not None:
        sticky.color = changes["color"]
    await db.commit()
    return _out(sticky, ctx.workspace.slug)


@router.delete(f"{_W}/stickies/{{sticky_id}}/", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sticky(sticky_id: str,
                        ctx: WorkspaceContext = Depends(get_workspace_context),
                        db: AsyncSession = Depends(get_db)) -> None:
    sticky = await _sticky_or_404(db, ctx, sticky_id)
    await db.delete(sticky)
    await db.commit()
    return None
