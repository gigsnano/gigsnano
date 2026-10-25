from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import get_db
from gigsnano_api.features.foundation import artifacts as FA
from gigsnano_api.features.foundation import service as FS
from gigsnano_api.features.foundation.compiler import compile_foundation
from gigsnano_api.features.foundation.diff import parse_unified_diff
from gigsnano_api.features.foundation.mapping import foundation_from_row
from gigsnano_api.features.foundation.schemas import (
    ArtifactOut,
    CreateArtifactPayload,
    FoundationOut,
    LockFoundationPayload,
    SetPinsPayload,
    StackDetectionOut,
    ValidateFoundationPayload,
    ValidationResultOut,
    ViolationOut,
)
from gigsnano_api.features.foundation.validator import validate
from gigsnano_api.models.foundation import ProjectFoundation
from gigsnano_api.models.projects import Project
from gigsnano_api.shared.context import (
    WorkspaceContext,
    get_project_or_404,
    get_workspace_context,
    require_project_write_access,
)

_WS = "/workspaces/{workspace_slug}/artifacts"

router = APIRouter(tags=["foundation"])

_BASE = "/workspaces/{workspace_slug}/projects/{project_id}/foundation"


def _out(row: ProjectFoundation) -> FoundationOut:
    return FoundationOut(
        project_id=row.project_id,
        preset_key=row.preset_key,
        allowed_libraries=list(row.allowed_libraries),
        enforce_design_tokens=row.enforce_design_tokens,
        quality_gates=list(row.quality_gates),
        database=row.database,
        architecture=row.architecture,
        pinned_artifacts=list(row.pinned_artifacts),
        status=row.status,
        version=row.version,
        history=list(row.history or []),
        pending_change=row.pending_change,
    )


@router.get(_BASE + "/", response_model=FoundationOut | None)
async def read_foundation(
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
):
    row = await FS.get_foundation(db, project.id)
    return _out(row) if row else None


@router.post(_BASE + "/lock/", response_model=FoundationOut)
async def lock_foundation(
    payload: LockFoundationPayload,
    project: Project = Depends(require_project_write_access),
    db: AsyncSession = Depends(get_db),
):
    try:
        row = await FS.lock_foundation(
            db,
            project_id=project.id,
            preset_key=payload.preset_key,
            allowed_libraries=payload.allowed_libraries,
            enforce_design_tokens=payload.enforce_design_tokens,
            quality_gates=payload.quality_gates,
            database=payload.database,
            architecture=payload.architecture,
        )
    except KeyError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown preset '{payload.preset_key}'")
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    await db.commit()
    return _out(row)


@router.post(_BASE + "/propose/", response_model=FoundationOut)
async def propose_foundation_change(
    payload: LockFoundationPayload,
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    proposer = getattr(ctx.user, "display_name", None) or getattr(ctx.user, "email", "") or "someone"
    try:
        row = await FS.propose_change(
            db,
            project_id=project.id,
            proposed_by=proposer,
            preset_key=payload.preset_key,
            allowed_libraries=payload.allowed_libraries,
            enforce_design_tokens=payload.enforce_design_tokens,
            quality_gates=payload.quality_gates,
            database=payload.database,
            architecture=payload.architecture,
        )
    except KeyError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown preset '{payload.preset_key}'")
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    await db.commit()
    return _out(row)


@router.post(_BASE + "/propose/approve/", response_model=FoundationOut)
async def approve_foundation_change(
    project: Project = Depends(require_project_write_access),
    db: AsyncSession = Depends(get_db),
):
    try:
        row = await FS.approve_change(db, project.id)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    await db.commit()
    return _out(row)


@router.post(_BASE + "/propose/reject/", response_model=FoundationOut)
async def reject_foundation_change(
    project: Project = Depends(require_project_write_access),
    db: AsyncSession = Depends(get_db),
):
    try:
        row = await FS.reject_change(db, project.id)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    await db.commit()
    return _out(row)


@router.get(_BASE + "/detect/", response_model=StackDetectionOut)
async def detect_stack(project: Project = Depends(get_project_or_404)):
    return StackDetectionOut(suggested_preset=FS.detect_stack(project.id))


# --- Artifact library (GIN-194) -------------------------------------------------


@router.get(_WS + "/", response_model=list[ArtifactOut])
async def list_artifacts(
    artifact_type: str | None = None,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    return await FA.list_visible(db, ctx.workspace.id, artifact_type)


@router.post(_WS + "/", response_model=ArtifactOut)
async def create_artifact(
    payload: CreateArtifactPayload,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    try:
        out = await FA.create_artifact(
            db,
            ctx.workspace.id,
            artifact_type=payload.artifact_type,
            name=payload.name,
            version=payload.version,
            visibility=payload.visibility,
            payload=payload.payload,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    await db.commit()
    return out


@router.get(_BASE + "/pins/", response_model=list[str])
async def get_pins(
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
):
    row = await FS.get_foundation(db, project.id)
    return list(row.pinned_artifacts) if row else []


@router.put(_BASE + "/pins/", response_model=FoundationOut)
async def set_pins(
    payload: SetPinsPayload,
    project: Project = Depends(require_project_write_access),
    db: AsyncSession = Depends(get_db),
):
    row = await FS.get_foundation(db, project.id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No locked Foundation for this project")
    try:
        await FA.assert_pins_visible(db, project.workspace_id, payload.pinned_artifacts)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    row.pinned_artifacts = payload.pinned_artifacts
    await db.commit()
    return _out(row)


@router.post(_BASE + "/validate/", response_model=ValidationResultOut)
async def validate_diff(
    payload: ValidateFoundationPayload,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
):
    row = await FS.get_foundation(db, project.id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No locked Foundation for this project")
    ruleset = compile_foundation(foundation_from_row(row))
    lines = parse_unified_diff(payload.diff)
    result = validate(lines, ruleset, gate_results=payload.gate_results)
    return ValidationResultOut(
        status=result.status,
        violations=[
            ViolationOut(
                rule=v.rule, file=v.file, line=v.line, blocking=v.blocking, detail=v.detail
            )
            for v in result.violations
        ],
    )
