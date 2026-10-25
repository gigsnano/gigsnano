"""Setup-draft CRUD with cohort gating and atomic revision conflicts."""

from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import utcnow
from gigsnano_api.features.solutions.cohort import is_solutions_cohort
from gigsnano_api.features.solutions.registry import OUTSIDE_COHORT_REASON, build_registry
from gigsnano_api.features.solutions.schemas import (
    CreateSetupDraftPayload,
    UpdateSetupDraftPayload,
)
from gigsnano_api.models.solutions import DRAFT_TTL_DAYS, SETUP_DRAFT_STEP, SetupDraft

_CONFLICT_MSG = (
    "This setup was changed somewhere else. "
    "Reload to get the latest version before continuing."
)
_NOT_FOUND_MSG = "Setup draft not found"


def _resolve_available_definition(workspace_slug: str, solution_key: str):
    """Return an available definition or raise 422 (unknown / disabled / outside cohort)."""
    if not is_solutions_cohort(workspace_slug):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, OUTSIDE_COHORT_REASON
        )

    registry = build_registry(workspace_slug)
    definition = next((s for s in registry.solutions if s.key == solution_key), None)
    if definition is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f'Unknown solution "{solution_key}".',
        )
    if definition.availability != "available":
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            definition.availability_reason
            or f"{definition.name} is not enabled for this workspace.",
        )
    return definition


async def list_setup_drafts(
    db: AsyncSession, *, workspace_id: str, user_id: str
) -> list[SetupDraft]:
    now = utcnow()
    rows = await db.execute(
        select(SetupDraft)
        .where(
            SetupDraft.workspace_id == workspace_id,
            SetupDraft.created_by_id == user_id,
            SetupDraft.expires_at > now,
        )
        .order_by(SetupDraft.updated_at.desc())
    )
    return list(rows.scalars().all())


async def create_setup_draft(
    db: AsyncSession,
    *,
    workspace_id: str,
    workspace_slug: str,
    user_id: str,
    payload: CreateSetupDraftPayload,
) -> SetupDraft:
    definition = _resolve_available_definition(workspace_slug, payload.solution_key)

    if payload.starting_point is not None:
        valid = {sp.key for sp in definition.starting_points}
        if payload.starting_point not in valid:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f'Unknown starting point "{payload.starting_point}".',
            )

    now = utcnow()
    draft = SetupDraft(
        workspace_id=workspace_id,
        created_by_id=user_id,
        solution_key=definition.key,
        solution_version=definition.version,
        starting_point=payload.starting_point,
        step=SETUP_DRAFT_STEP,
        values={},
        revision=1,
        expires_at=now + timedelta(days=DRAFT_TTL_DAYS),
    )
    db.add(draft)
    await db.flush()
    return draft


async def update_setup_draft(
    db: AsyncSession,
    *,
    workspace_id: str,
    user_id: str,
    draft_id: str,
    payload: UpdateSetupDraftPayload,
) -> SetupDraft:
    now = utcnow()
    changes = payload.model_dump(exclude_unset=True)
    changes.pop("revision", None)

    values: dict = {
        "revision": SetupDraft.revision + 1,
        "updated_at": now,
    }
    if "step" in changes:
        values["step"] = changes["step"]
    if "values" in changes:
        values["values"] = changes["values"]
    if "starting_point" in changes:
        values["starting_point"] = changes["starting_point"]

    result = await db.execute(
        update(SetupDraft)
        .where(
            SetupDraft.id == draft_id,
            SetupDraft.workspace_id == workspace_id,
            SetupDraft.created_by_id == user_id,
            SetupDraft.expires_at > now,
            SetupDraft.revision == payload.revision,
        )
        .values(**values)
    )
    if result.rowcount == 0:
        existing = (
            await db.execute(
                select(SetupDraft).where(
                    SetupDraft.id == draft_id,
                    SetupDraft.workspace_id == workspace_id,
                    SetupDraft.created_by_id == user_id,
                    SetupDraft.expires_at > now,
                )
            )
        ).scalar_one_or_none()
        if existing is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, _CONFLICT_MSG)
        raise HTTPException(status.HTTP_404_NOT_FOUND, _NOT_FOUND_MSG)

    await db.flush()
    draft = await db.get(SetupDraft, draft_id)
    if draft is None:  # pragma: no cover — row just updated
        raise HTTPException(status.HTTP_404_NOT_FOUND, _NOT_FOUND_MSG)
    return draft


async def delete_setup_draft(
    db: AsyncSession,
    *,
    workspace_id: str,
    user_id: str,
    draft_id: str,
) -> None:
    # Owner + unexpired only — expired/other-user rows look like missing (404).
    # Keep the compare in SQL so SQLite's naive datetimes don't blow up in Python.
    now = utcnow()
    result = await db.execute(
        delete(SetupDraft).where(
            SetupDraft.id == draft_id,
            SetupDraft.workspace_id == workspace_id,
            SetupDraft.created_by_id == user_id,
            SetupDraft.expires_at > now,
        )
    )
    if result.rowcount == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, _NOT_FOUND_MSG)
