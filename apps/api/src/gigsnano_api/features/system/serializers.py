"""ORM -> API serializers for repositories and bundles (GIN-410/412)."""

from __future__ import annotations

from collections.abc import Mapping

from gigsnano_api.features.system.schemas import (
    BundleOut,
    BundleVersionOut,
    ERepoHealth,
    RepositoryOut,
)
from gigsnano_api.models.system import ProjectRepository, SystemBundle, SystemBundleVersion

_FAILED = "failed"
_IN_PROGRESS = {"pending", "cloning", "syncing", "indexing"}


def repo_health(repo: ProjectRepository) -> ERepoHealth:
    """Roll clone/sync/index state up to a single icon+text health (never colour alone)."""
    statuses = [repo.clone_status.value, repo.sync_status.value, repo.index_status.value]
    if _FAILED in statuses:
        return ERepoHealth.ERROR
    if any(s in _IN_PROGRESS for s in statuses):
        return ERepoHealth.SYNCING
    if repo.clone_status.value == "ready" and repo.index_status.value == "ready":
        return ERepoHealth.READY
    return ERepoHealth.BEHIND


def serialize_repository(repo: ProjectRepository, bundle_ids: list[str]) -> RepositoryOut:
    return RepositoryOut(
        id=repo.id,
        project_id=repo.project_id,
        provider=repo.provider,
        external_repository_id=repo.external_repository_id,
        full_name=repo.full_name,
        display_name=repo.display_name,
        repository_type=repo.repository_type,
        default_branch=repo.default_branch,
        is_primary=repo.is_primary,
        default_access=repo.default_access,
        health=repo_health(repo),
        clone_status=repo.clone_status,
        sync_status=repo.sync_status,
        index_status=repo.index_status,
        indexed_commit_sha=repo.indexed_commit_sha,
        indexed_at=repo.indexed_at,
        bundle_ids=bundle_ids,
        created_at=repo.created_at,
        updated_at=repo.updated_at,
        archived_at=repo.archived_at,
    )


def serialize_bundle(
    bundle: SystemBundle, version: SystemBundleVersion, affected_work_item_count: int = 0
) -> BundleOut:
    config: Mapping = version.configuration_json or {"repositories": [], "dependencies": []}
    repos = config.get("repositories", [])
    write = sum(1 for r in repos if r.get("access") == "write")
    reference = sum(1 for r in repos if r.get("access") == "reference")
    return BundleOut(
        id=bundle.id,
        project_id=bundle.project_id,
        name=bundle.name,
        description=bundle.description,
        status=bundle.status,
        is_default=bundle.is_default,
        current_version=bundle.current_version,
        repository_count=len(repos),
        write_count=write,
        reference_count=reference,
        affected_work_item_count=affected_work_item_count,
        updated_at=bundle.updated_at,
        created_at=bundle.created_at,
        latest=BundleVersionOut.model_validate(
            {
                "id": version.id,
                "bundle_id": version.bundle_id,
                "version": version.version,
                "repositories": repos,
                "dependencies": config.get("dependencies", []),
                "validation_result": version.validation_result_json
                or {"valid": False, "issues": []},
                "created_at": version.created_at,
            }
        ),
    )
