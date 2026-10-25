"""Business logic for repositories + System Bundles (GIN-410/412).

Kept out of the router so the rules (dedupe, one-Primary, versioning, default gate)
are unit-testable without HTTP. Raises HTTPException for the caller to surface.
"""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.features.system.schemas import (
    BulkConnectPayload,
    BundleOut,
    ConnectResult,
    CreateBundlePayload,
    RepositoryOut,
    UpdateBundlePayload,
    UpdateRepositoryPayload,
    ValidateBundlePayload,
    ValidationResult,
)
from gigsnano_api.features.system.serializers import serialize_bundle, serialize_repository
from gigsnano_api.features.system.validation import validate_bundle_config
from gigsnano_api.models.system import (
    EBundleStatus,
    ECloneStatus,
    EIndexStatus,
    ERepoAccess,
    ERepositoryType,
    ESyncStatus,
    ProjectRepository,
    SystemBundle,
    SystemBundleVersion,
)

# --- Repositories -----------------------------------------------------------


async def _active_repos(db: AsyncSession, project_id: str) -> list[ProjectRepository]:
    rows = await db.execute(
        select(ProjectRepository)
        .where(ProjectRepository.project_id == project_id)
        .where(ProjectRepository.archived_at.is_(None))
        .order_by(ProjectRepository.created_at)
    )
    return list(rows.scalars().all())


async def _active_bundles(db: AsyncSession, project_id: str) -> list[SystemBundle]:
    rows = await db.execute(
        select(SystemBundle)
        .where(SystemBundle.project_id == project_id)
        .where(SystemBundle.status != EBundleStatus.ARCHIVED)
        .order_by(SystemBundle.created_at)
    )
    return list(rows.scalars().all())


async def _current_version(db: AsyncSession, bundle: SystemBundle) -> SystemBundleVersion:
    row = await db.execute(
        select(SystemBundleVersion)
        .where(SystemBundleVersion.bundle_id == bundle.id)
        .where(SystemBundleVersion.version == bundle.current_version)
    )
    return row.scalar_one()


async def _repo_bundle_map(db: AsyncSession, project_id: str) -> dict[str, list[str]]:
    """repo id -> [bundle ids that reference it], across active bundles' current versions."""
    mapping: dict[str, list[str]] = {}
    for bundle in await _active_bundles(db, project_id):
        version = await _current_version(db, bundle)
        for cfg in (version.configuration_json or {}).get("repositories", []):
            mapping.setdefault(cfg["project_repository_id"], []).append(bundle.id)
    return mapping


async def list_repositories(db: AsyncSession, project_id: str) -> list[RepositoryOut]:
    repos = await _active_repos(db, project_id)
    bundle_map = await _repo_bundle_map(db, project_id)
    return [serialize_repository(r, bundle_map.get(r.id, [])) for r in repos]


async def bulk_connect(
    db: AsyncSession, project_id: str, payload: BulkConnectPayload
) -> list[ConnectResult]:
    """Connect one or many; per-repo result so one failure never rolls back the batch.
    A repo already connected (by external id or full name) is reported ok+unchanged."""
    existing = await _active_repos(db, project_id)
    by_ext = {r.external_repository_id: r for r in existing}
    by_name = {r.full_name: r for r in existing}
    results: list[ConnectResult] = []
    for item in payload.repositories:
        dup = by_ext.get(item.external_repository_id) or by_name.get(item.full_name)
        if dup is not None:
            results.append(
                ConnectResult(
                    full_name=item.full_name, ok=True, repository=serialize_repository(dup, [])
                )
            )
            continue
        repo = ProjectRepository(
            project_id=project_id,
            provider="github",
            external_repository_id=item.external_repository_id,
            full_name=item.full_name,
            display_name=item.full_name.rsplit("/", 1)[-1] or item.full_name,
            repository_type=item.repository_type or ERepositoryType.SERVICE,
            default_branch=item.default_branch or "main",
            is_primary=False,
            default_access=item.default_access or ERepoAccess.REFERENCE,
            clone_status=ECloneStatus.PENDING,
            sync_status=ESyncStatus.PENDING,
            index_status=EIndexStatus.PENDING,
        )
        db.add(repo)
        # Flush per repo so a unique-constraint clash fails only that item.
        try:
            await db.flush()
        except Exception:  # noqa: BLE001 - reported per-item, not fatal
            await db.rollback()
            results.append(
                ConnectResult(
                    full_name=item.full_name, ok=False, error="Could not connect repository"
                )
            )
            continue
        by_ext[repo.external_repository_id] = repo
        by_name[repo.full_name] = repo
        results.append(
            ConnectResult(
                full_name=item.full_name, ok=True, repository=serialize_repository(repo, [])
            )
        )
    await db.commit()
    return results


async def _get_active_repo(db: AsyncSession, project_id: str, repo_id: str) -> ProjectRepository:
    repo = await db.get(ProjectRepository, repo_id)
    if repo is None or repo.project_id != project_id or repo.archived_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Repository not found")
    return repo


async def update_repository(
    db: AsyncSession, project_id: str, repo_id: str, payload: UpdateRepositoryPayload
) -> RepositoryOut:
    repo = await _get_active_repo(db, project_id, repo_id)
    if payload.display_name is not None:
        repo.display_name = payload.display_name.strip()
    if payload.repository_type is not None:
        repo.repository_type = payload.repository_type
    if payload.default_access is not None:
        repo.default_access = payload.default_access
    if payload.default_branch is not None:
        repo.default_branch = payload.default_branch.strip()
    if payload.is_primary is True:
        # At most one active Primary. Demote the others and FLUSH before promoting
        # this one, or the partial unique index sees two primaries mid-transaction.
        for other in await _active_repos(db, project_id):
            if other.id != repo_id:
                other.is_primary = False
        await db.flush()
        repo.is_primary = True
    await db.commit()
    bundle_map = await _repo_bundle_map(db, project_id)
    await db.refresh(repo)
    return serialize_repository(repo, bundle_map.get(repo.id, []))


async def archive_repository(db: AsyncSession, project_id: str, repo_id: str) -> None:
    from gigsnano_api.core.db import utcnow

    repo = await _get_active_repo(db, project_id, repo_id)
    repo.archived_at = utcnow()
    await db.commit()


async def refresh_repository(db: AsyncSession, project_id: str, repo_id: str) -> RepositoryOut:
    from gigsnano_api.core.db import utcnow

    repo = await _get_active_repo(db, project_id, repo_id)
    # Placeholder refresh until the provider-health job lands (GIN-416): mark healthy.
    now = utcnow()
    repo.clone_status = ECloneStatus.READY
    repo.sync_status = ESyncStatus.READY
    repo.index_status = EIndexStatus.READY
    repo.indexed_at = now
    await db.commit()
    bundle_map = await _repo_bundle_map(db, project_id)
    await db.refresh(repo)
    return serialize_repository(repo, bundle_map.get(repo.id, []))


# --- Bundles ----------------------------------------------------------------


def validate(payload: ValidateBundlePayload) -> ValidationResult:
    result = validate_bundle_config(
        [r.model_dump(mode="json") for r in payload.repositories],
        [d.model_dump(mode="json") for d in payload.dependencies],
    )
    return ValidationResult.model_validate(result)


def _bundle_status(save_as_draft: bool, valid: bool) -> EBundleStatus:
    if save_as_draft:
        return EBundleStatus.DRAFT
    return EBundleStatus.VALID if valid else EBundleStatus.INVALID


async def list_bundles(db: AsyncSession, project_id: str) -> list[BundleOut]:
    out: list[BundleOut] = []
    for bundle in await _active_bundles(db, project_id):
        version = await _current_version(db, bundle)
        out.append(serialize_bundle(bundle, version))
    return out


async def _get_active_bundle(db: AsyncSession, project_id: str, bundle_id: str) -> SystemBundle:
    bundle = await db.get(SystemBundle, bundle_id)
    if bundle is None or bundle.project_id != project_id or bundle.status == EBundleStatus.ARCHIVED:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bundle not found")
    return bundle


async def get_bundle(db: AsyncSession, project_id: str, bundle_id: str) -> BundleOut:
    bundle = await _get_active_bundle(db, project_id, bundle_id)
    return serialize_bundle(bundle, await _current_version(db, bundle))


async def create_bundle(
    db: AsyncSession, project_id: str, payload: CreateBundlePayload
) -> BundleOut:
    repos = [r.model_dump(mode="json") for r in payload.repositories]
    deps = [d.model_dump(mode="json") for d in payload.dependencies]
    result = validate_bundle_config(repos, deps)
    bundle = SystemBundle(
        project_id=project_id,
        name=payload.name.strip(),
        description=payload.description.strip(),
        status=_bundle_status(payload.save_as_draft, result["valid"]),
        is_default=False,
        current_version=1,
    )
    db.add(bundle)
    await db.flush()
    version = SystemBundleVersion(
        bundle_id=bundle.id,
        version=1,
        configuration_json={"repositories": repos, "dependencies": deps},
        validation_result_json=result,
    )
    db.add(version)
    await db.commit()
    await db.refresh(bundle)
    return serialize_bundle(bundle, version)


async def update_bundle(
    db: AsyncSession, project_id: str, bundle_id: str, payload: UpdateBundlePayload
) -> BundleOut:
    bundle = await _get_active_bundle(db, project_id, bundle_id)
    if payload.name is not None:
        bundle.name = payload.name.strip()
    if payload.description is not None:
        bundle.description = payload.description.strip()

    version = await _current_version(db, bundle)
    if payload.repositories is not None or payload.dependencies is not None:
        # Editing config mints a NEW immutable version; active runs keep their own.
        current = version
        repos = (
            [r.model_dump(mode="json") for r in payload.repositories]
            if payload.repositories is not None
            else (current.configuration_json or {}).get("repositories", [])
        )
        deps = (
            [d.model_dump(mode="json") for d in payload.dependencies]
            if payload.dependencies is not None
            else (current.configuration_json or {}).get("dependencies", [])
        )
        result = validate_bundle_config(repos, deps)
        bundle.current_version += 1
        version = SystemBundleVersion(
            bundle_id=bundle.id,
            version=bundle.current_version,
            configuration_json={"repositories": repos, "dependencies": deps},
            validation_result_json=result,
        )
        db.add(version)
        bundle.status = _bundle_status(payload.save_as_draft, result["valid"])
        if bundle.status != EBundleStatus.VALID:
            bundle.is_default = False
    await db.commit()
    await db.refresh(bundle)
    return serialize_bundle(bundle, version)


async def set_default(db: AsyncSession, project_id: str, bundle_id: str) -> BundleOut:
    bundle = await _get_active_bundle(db, project_id, bundle_id)
    if bundle.status != EBundleStatus.VALID:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only a valid bundle can be set as default")
    for other in await _active_bundles(db, project_id):
        other.is_default = other.id == bundle_id
    await db.commit()
    await db.refresh(bundle)
    return serialize_bundle(bundle, await _current_version(db, bundle))


async def archive_bundle(db: AsyncSession, project_id: str, bundle_id: str) -> None:
    bundle = await _get_active_bundle(db, project_id, bundle_id)
    bundle.status = EBundleStatus.ARCHIVED
    bundle.is_default = False
    await db.commit()
