"""Multi-repository connection + System Bundle API (GIN-410 / GIN-412).

Paths mirror the frontend service contract verbatim (trailing slashes required by
the /api proxy). Reads are gated by project membership (get_project_or_404);
mutations require MANAGE_SETTINGS.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.deps import get_current_user
from gigsnano_api.auth.models import User
from gigsnano_api.core.db import get_db
from gigsnano_api.features.system import (
    audit,
    code_scope_service,
    delivery_service,
    execution_plan,
    health,
    service,
)
from gigsnano_api.features.system.schemas import (
    AuditEventOut,
    BulkConnectPayload,
    BundleOut,
    CodeScopeOut,
    ConnectResult,
    CreateBundlePayload,
    DeliveryOut,
    EffectiveScopeOut,
    ExecutionPlanOut,
    ProjectHealthOut,
    RepositoryOut,
    SaveCodeScopePayload,
    SourceSnapshotOut,
    UpdateBundlePayload,
    UpdateDeliveryRepoPayload,
    UpdateRepositoryPayload,
    ValidateBundlePayload,
    ValidationResult,
)
from gigsnano_api.models import Project
from gigsnano_api.shared.context import get_project_or_404, require_project_permission
from gigsnano_api.shared.project_rbac import EProjectPermission

router = APIRouter(tags=["system-bundles"])

_P = "/workspaces/{workspace_slug}/projects/{project_id}"
_OK = {"success": True}

_manage = require_project_permission(EProjectPermission.MANAGE_SETTINGS)
_deliver = require_project_permission(EProjectPermission.DELIVER)


# ---- Repositories ----------------------------------------------------------


@router.get(f"{_P}/repositories/", response_model=list[RepositoryOut])
async def list_repositories(
    project: Project = Depends(get_project_or_404), db: AsyncSession = Depends(get_db)
):
    return await service.list_repositories(db, project.id)


@router.post(f"{_P}/repositories/", response_model=list[ConnectResult])
async def connect_repositories(
    payload: BulkConnectPayload,
    project: Project = Depends(_manage),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await service.bulk_connect(db, project.id, payload)
    await audit.record(
        db,
        project_id=project.id,
        actor_user_id=user.id,
        action="repository.connect",
        object_type="repository",
        after=f"{sum(1 for r in result if r.ok)} connected",
    )
    return result


@router.patch(f"{_P}/repositories/{{repo_id}}/", response_model=RepositoryOut)
async def update_repository(
    repo_id: str,
    payload: UpdateRepositoryPayload,
    project: Project = Depends(_manage),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await service.update_repository(db, project.id, repo_id, payload)
    action = "repository.set_primary" if payload.is_primary else "repository.update"
    await audit.record(
        db,
        project_id=project.id,
        actor_user_id=user.id,
        action=action,
        object_type="repository",
        object_id=repo_id,
    )
    return result


@router.delete(f"{_P}/repositories/{{repo_id}}/")
async def disconnect_repository(
    repo_id: str,
    project: Project = Depends(_manage),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await service.archive_repository(db, project.id, repo_id)
    await audit.record(
        db,
        project_id=project.id,
        actor_user_id=user.id,
        action="repository.disconnect",
        object_type="repository",
        object_id=repo_id,
    )
    return _OK


@router.post(f"{_P}/repositories/{{repo_id}}/refresh/", response_model=RepositoryOut)
async def refresh_repository(
    repo_id: str,
    project: Project = Depends(_manage),
    db: AsyncSession = Depends(get_db),
):
    return await service.refresh_repository(db, project.id, repo_id)


# ---- Bundles ---------------------------------------------------------------


@router.get(f"{_P}/system-bundles/", response_model=list[BundleOut])
async def list_bundles(
    project: Project = Depends(get_project_or_404), db: AsyncSession = Depends(get_db)
):
    return await service.list_bundles(db, project.id)


@router.post(f"{_P}/system-bundles/validate/", response_model=ValidationResult)
async def validate_bundle(
    payload: ValidateBundlePayload,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
):
    return service.validate(payload)


@router.post(f"{_P}/system-bundles/", response_model=BundleOut)
async def create_bundle(
    payload: CreateBundlePayload,
    project: Project = Depends(_manage),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await service.create_bundle(db, project.id, payload)
    await audit.record(
        db,
        project_id=project.id,
        actor_user_id=user.id,
        action="bundle.create",
        object_type="bundle",
        object_id=result.id,
        after=f"{result.name} ({result.status.value})",
    )
    return result


@router.get(f"{_P}/system-bundles/{{bundle_id}}/", response_model=BundleOut)
async def get_bundle(
    bundle_id: str,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
):
    return await service.get_bundle(db, project.id, bundle_id)


@router.patch(f"{_P}/system-bundles/{{bundle_id}}/", response_model=BundleOut)
async def update_bundle(
    bundle_id: str,
    payload: UpdateBundlePayload,
    project: Project = Depends(_manage),
    db: AsyncSession = Depends(get_db),
):
    return await service.update_bundle(db, project.id, bundle_id, payload)


@router.delete(f"{_P}/system-bundles/{{bundle_id}}/")
async def archive_bundle(
    bundle_id: str,
    project: Project = Depends(_manage),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await service.archive_bundle(db, project.id, bundle_id)
    await audit.record(
        db,
        project_id=project.id,
        actor_user_id=user.id,
        action="bundle.archive",
        object_type="bundle",
        object_id=bundle_id,
    )
    return _OK


@router.post(f"{_P}/system-bundles/{{bundle_id}}/default/", response_model=BundleOut)
async def set_default_bundle(
    bundle_id: str,
    project: Project = Depends(_manage),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await service.set_default(db, project.id, bundle_id)
    await audit.record(
        db,
        project_id=project.id,
        actor_user_id=user.id,
        action="bundle.set_default",
        object_type="bundle",
        object_id=bundle_id,
    )
    return result


# ---- Work-item Code scope (GIN-413) ----------------------------------------


@router.get(f"{_P}/stories/{{story_id}}/code-scope/", response_model=CodeScopeOut)
async def get_code_scope(
    story_id: str,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
):
    return await code_scope_service.get_code_scope(db, project.id, story_id)


@router.put(f"{_P}/stories/{{story_id}}/code-scope/", response_model=CodeScopeOut)
async def save_code_scope(
    story_id: str,
    payload: SaveCodeScopePayload,
    project: Project = Depends(_deliver),
    db: AsyncSession = Depends(get_db),
):
    return await code_scope_service.save_code_scope(db, project.id, story_id, payload)


@router.post(f"{_P}/stories/{{story_id}}/code-scope/confirm/", response_model=CodeScopeOut)
async def confirm_code_scope(
    story_id: str,
    project: Project = Depends(_deliver),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await code_scope_service.confirm_code_scope(db, project.id, story_id, user.id)
    await audit.record(
        db,
        project_id=project.id,
        actor_user_id=user.id,
        action="code_scope.confirm",
        object_type="work_item",
        object_id=story_id,
        after=f"{len(result.repositories)} repos, v{result.bundle_version}",
    )
    return result


@router.post(f"{_P}/stories/{{story_id}}/code-scope/reset/", response_model=CodeScopeOut)
async def reset_code_scope(
    story_id: str,
    project: Project = Depends(_deliver),
    db: AsyncSession = Depends(get_db),
):
    return await code_scope_service.reset_code_scope(db, project.id, story_id)


@router.get(f"{_P}/stories/{{story_id}}/code-scope/effective/", response_model=EffectiveScopeOut)
async def effective_code_scope(
    story_id: str,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
):
    return await code_scope_service.effective_scope(db, project.id, story_id)


# ---- Delivery Bundle (GIN-414) ---------------------------------------------


@router.get(f"{_P}/stories/{{story_id}}/delivery/", response_model=DeliveryOut)
async def get_delivery(
    story_id: str,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
):
    return await delivery_service.get_delivery(db, project.id, story_id)


@router.post(f"{_P}/stories/{{story_id}}/delivery/", response_model=DeliveryOut)
async def create_delivery(
    story_id: str,
    project: Project = Depends(_deliver),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await delivery_service.create_delivery(db, project.id, story_id, user.id)


@router.patch(
    f"{_P}/stories/{{story_id}}/delivery/repositories/{{repo_id}}/", response_model=DeliveryOut
)
async def update_delivery_repo(
    story_id: str,
    repo_id: str,
    payload: UpdateDeliveryRepoPayload,
    project: Project = Depends(_deliver),
    db: AsyncSession = Depends(get_db),
):
    return await delivery_service.update_repo(db, project.id, story_id, repo_id, payload)


@router.post(f"{_P}/stories/{{story_id}}/delivery/cancel/", response_model=DeliveryOut)
async def cancel_delivery(
    story_id: str,
    project: Project = Depends(_deliver),
    db: AsyncSession = Depends(get_db),
):
    return await delivery_service.set_cancelled(db, project.id, story_id, True)


# ---- Scoped execution plan + Source Snapshot (GIN-415) ---------------------


@router.get(f"{_P}/stories/{{story_id}}/execution-plan/", response_model=ExecutionPlanOut)
async def get_execution_plan(
    story_id: str,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
):
    return await execution_plan.resolve_plan(db, project.id, story_id)


@router.post(f"{_P}/stories/{{story_id}}/source-snapshot/", response_model=SourceSnapshotOut)
async def create_source_snapshot(
    story_id: str,
    project: Project = Depends(_deliver),
    db: AsyncSession = Depends(get_db),
):
    return await execution_plan.create_source_snapshot(db, project.id, story_id)


@router.get(f"{_P}/stories/{{story_id}}/source-snapshot/", response_model=SourceSnapshotOut | None)
async def get_source_snapshot(
    story_id: str,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
):
    return await execution_plan.latest_snapshot(db, project.id, story_id)


# ---- Health + audit (GIN-416) ----------------------------------------------


@router.get(f"{_P}/codebase/health/", response_model=ProjectHealthOut)
async def get_codebase_health(
    project: Project = Depends(get_project_or_404), db: AsyncSession = Depends(get_db)
):
    return await health.build_project_health(db, project.id)


@router.get(f"{_P}/system-audit/", response_model=list[AuditEventOut])
async def list_system_audit(
    project: Project = Depends(get_project_or_404), db: AsyncSession = Depends(get_db)
):
    return await audit.list_events(db, project.id)
