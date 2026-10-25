"""Solution registry + resumable setup-draft routes."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import get_db
from gigsnano_api.features.solutions import service as drafts
from gigsnano_api.features.solutions.registry import build_registry
from gigsnano_api.features.solutions.schemas import (
    CreateSetupDraftPayload,
    SetupDraftOut,
    SolutionRegistryOut,
    UpdateSetupDraftPayload,
)
from gigsnano_api.models.solutions import SetupDraft
from gigsnano_api.shared.context import WorkspaceContext, get_workspace_context

router = APIRouter(tags=["solutions"])

_W = "/workspaces/{workspace_slug}"


def _draft_out(draft: SetupDraft, slug: str) -> SetupDraftOut:
    return SetupDraftOut(
        id=draft.id,
        workspace_slug=slug,
        solution_key=draft.solution_key,
        solution_version=draft.solution_version,
        starting_point=draft.starting_point,
        step=draft.step,
        values=draft.values or {},
        created_by=draft.created_by_id,
        revision=draft.revision,
        created_at=draft.created_at,
        updated_at=draft.updated_at,
        expires_at=draft.expires_at,
    )


@router.get(f"{_W}/solutions/", response_model=SolutionRegistryOut)
async def get_solutions(
    ctx: WorkspaceContext = Depends(get_workspace_context),
) -> SolutionRegistryOut:
    return build_registry(ctx.workspace.slug)


@router.get(f"{_W}/setup-drafts/", response_model=list[SetupDraftOut])
async def list_setup_drafts(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> list[SetupDraftOut]:
    rows = await drafts.list_setup_drafts(
        db, workspace_id=ctx.workspace.id, user_id=ctx.user.id
    )
    return [_draft_out(d, ctx.workspace.slug) for d in rows]


@router.post(
    f"{_W}/setup-drafts/",
    response_model=SetupDraftOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_setup_draft(
    payload: CreateSetupDraftPayload,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> SetupDraftOut:
    draft = await drafts.create_setup_draft(
        db,
        workspace_id=ctx.workspace.id,
        workspace_slug=ctx.workspace.slug,
        user_id=ctx.user.id,
        payload=payload,
    )
    await db.commit()
    return _draft_out(draft, ctx.workspace.slug)


@router.patch(f"{_W}/setup-drafts/{{draft_id}}/", response_model=SetupDraftOut)
async def update_setup_draft(
    draft_id: str,
    payload: UpdateSetupDraftPayload,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> SetupDraftOut:
    draft = await drafts.update_setup_draft(
        db,
        workspace_id=ctx.workspace.id,
        user_id=ctx.user.id,
        draft_id=draft_id,
        payload=payload,
    )
    await db.commit()
    return _draft_out(draft, ctx.workspace.slug)


@router.delete(f"{_W}/setup-drafts/{{draft_id}}/")
async def delete_setup_draft(
    draft_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    await drafts.delete_setup_draft(
        db,
        workspace_id=ctx.workspace.id,
        user_id=ctx.user.id,
        draft_id=draft_id,
    )
    await db.commit()
    return {"success": True}
