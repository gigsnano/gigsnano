"""Scoped execution plan + Source Snapshot (GIN-415, safe domain layer).

Resolves a confirmed work-item Code scope into the authoritative plan an agent run
executes under — per-repo mode (Write/Reference/Excluded), base branch, mount path,
and the exact starting commit — and records an immutable Source Snapshot.

This module is the SOURCE OF TRUTH the runner enforces against; the filesystem /
worktree / read-only-FS enforcement and federated search that *consult* this plan
are the runner-integration pieces, gated behind `multi_repo_enabled` and deliberately
not wired into the live agent path here.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.features.system import code_scope_service
from gigsnano_api.features.system.schemas import (
    ExecPlanRepoOut,
    ExecutionPlanOut,
    SourceSnapshotOut,
)
from gigsnano_api.features.system.service import _active_bundles, _active_repos, _current_version
from gigsnano_api.models.system import (
    ERepoScopeMode,
    SourceSnapshot,
    SystemBundleVersion,
)


def can_write(plan: ExecutionPlanOut, repo_id: str) -> bool:
    """An agent may create branches/commits/PRs only in Write repos."""
    return repo_id in plan.write_ids


def can_read(plan: ExecutionPlanOut, repo_id: str) -> bool:
    """An agent may read Write + Reference repos; never Excluded ones."""
    return repo_id in plan.write_ids or repo_id in plan.reference_ids


async def _mount_paths(db: AsyncSession, bundle_version_id: str | None) -> dict[str, str]:
    if not bundle_version_id:
        return {}
    version = await db.get(SystemBundleVersion, bundle_version_id)
    if version is None:
        return {}
    return {
        c["project_repository_id"]: c.get("mount_path", "")
        for c in (version.configuration_json or {}).get("repositories", [])
    }


async def _is_stale(db: AsyncSession, project_id: str, pinned_version_id: str | None) -> bool:
    """Stale if the Default bundle was edited (new version) since this scope confirmed."""
    for bundle in await _active_bundles(db, project_id):
        if bundle.is_default:
            current = await _current_version(db, bundle)
            return pinned_version_id is not None and pinned_version_id != current.id
    return False


def _plan_repo(srow, repo, mount: str) -> ExecPlanRepoOut:
    clone_ready = repo is not None and repo.clone_status.value == "ready"
    index_ready = repo is not None and repo.index_status.value == "ready"
    return ExecPlanRepoOut(
        project_repository_id=srow.project_repository_id,
        display_name=repo.display_name if repo else "",
        mode=srow.mode,
        base_branch=srow.base_branch,
        mount_path=mount,
        commit_sha=repo.indexed_commit_sha if repo else None,
        clone_ready=clone_ready,
        index_ready=index_ready,
        available=clone_ready,
    )


def _plan_warnings(stale: bool, plan_repos: list[ExecPlanRepoOut]) -> list[str]:
    warnings: list[str] = []
    if stale:
        warnings.append("The default bundle changed since this scope was confirmed — re-confirm.")
    for r in plan_repos:
        if r.mode == ERepoScopeMode.REFERENCE and not r.available:
            warnings.append(
                f"Reference repository {r.project_repository_id} is unavailable — degraded context."
            )
    return warnings


def _required_writes_available(plan_repos: list[ExecPlanRepoOut], scope_rows: dict) -> bool:
    return all(
        r.available
        for r in plan_repos
        if r.mode == ERepoScopeMode.WRITE and scope_rows[r.project_repository_id].required_delivery
    )


async def resolve_plan(db: AsyncSession, project_id: str, story_id: str) -> ExecutionPlanOut:
    """Resolve the confirmed scope into an execution plan (409 if not confirmed)."""
    effective = await code_scope_service.effective_scope(db, project_id, story_id)
    scope = await code_scope_service._existing(db, story_id)
    assert scope is not None
    scope_rows = {
        r.project_repository_id: r for r in await code_scope_service._repo_scope_rows(db, scope.id)
    }
    repos_by_id = {r.id: r for r in await _active_repos(db, project_id)}
    mounts = await _mount_paths(db, scope.bundle_version_id)
    stale = await _is_stale(db, project_id, scope.bundle_version_id)

    plan_repos = [
        _plan_repo(srow, repos_by_id.get(rid), mounts.get(rid, ""))
        for rid, srow in scope_rows.items()
    ]
    return ExecutionPlanOut(
        work_item_id=story_id,
        bundle_version_id=scope.bundle_version_id,
        branch_pattern=scope.branch_pattern,
        stale=stale,
        can_start=not stale and _required_writes_available(plan_repos, scope_rows),
        repositories=plan_repos,
        write_ids=effective.write,
        reference_ids=effective.reference,
        excluded_ids=effective.excluded,
        warnings=_plan_warnings(stale, plan_repos),
    )


async def create_source_snapshot(
    db: AsyncSession,
    project_id: str,
    story_id: str,
    *,
    agent_run_id: str | None = None,
    deployment_run_id: str | None = None,
) -> SourceSnapshotOut:
    """Record the exact commits (Write + Reference) the run is pinned to. Immutable.
    Secrets are never included — only ids, commit SHAs, mount paths, and mode."""
    plan = await resolve_plan(db, project_id, story_id)
    commits = {
        r.project_repository_id: {
            "commit_sha": r.commit_sha,
            "mount_path": r.mount_path,
            "mode": r.mode.value,
            "base_branch": r.base_branch,
        }
        for r in plan.repositories
        if r.mode != ERepoScopeMode.EXCLUDED
    }
    snapshot = SourceSnapshot(
        project_id=project_id,
        work_item_id=story_id,
        bundle_version_id=plan.bundle_version_id,
        agent_run_id=agent_run_id,
        deployment_run_id=deployment_run_id,
        repository_commits_json=commits,
    )
    db.add(snapshot)
    await db.commit()
    await db.refresh(snapshot)
    return _serialize_snapshot(snapshot)


def _serialize_snapshot(s: SourceSnapshot) -> SourceSnapshotOut:
    return SourceSnapshotOut(
        id=s.id,
        project_id=s.project_id,
        work_item_id=s.work_item_id,
        bundle_version_id=s.bundle_version_id,
        agent_run_id=s.agent_run_id,
        deployment_run_id=s.deployment_run_id,
        repository_commits=s.repository_commits_json or {},
        created_at=s.created_at,
    )


async def latest_snapshot(
    db: AsyncSession, project_id: str, story_id: str
) -> SourceSnapshotOut | None:
    row = await db.execute(
        select(SourceSnapshot)
        .where(SourceSnapshot.project_id == project_id)
        .where(SourceSnapshot.work_item_id == story_id)
        .order_by(SourceSnapshot.created_at.desc())
        .limit(1)
    )
    snapshot = row.scalar_one_or_none()
    return _serialize_snapshot(snapshot) if snapshot else None
