"""Repository + bundle health rollup (GIN-416). Pure — Healthy / Degraded /
Blocked / Unknown, with bundle health derived from required vs optional repos.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence

HEALTHY = "healthy"
DEGRADED = "degraded"
BLOCKED = "blocked"
UNKNOWN = "unknown"

_FAILED = "failed"
_IN_PROGRESS = {"pending", "cloning", "syncing", "indexing"}


def repo_health_rollup(clone_status: str, sync_status: str, index_status: str) -> str:
    """Roll independent clone/sync/index state up to one 4-state health."""
    statuses = [clone_status, sync_status, index_status]
    if _FAILED in statuses:
        return BLOCKED
    if clone_status == "ready" and index_status == "ready":
        return HEALTHY
    if any(s in _IN_PROGRESS for s in statuses) or clone_status == "ready":
        return DEGRADED
    return UNKNOWN


def bundle_health(repos: Sequence[Mapping]) -> str:
    """Bundle health from its repos. Each repo: {rollup, required}. A required
    repo's failure blocks; an optional repo's failure only degrades."""
    if not repos:
        return UNKNOWN
    required = [r for r in repos if r.get("required")]
    if any(r["rollup"] == BLOCKED for r in required):
        return BLOCKED
    if any(r["rollup"] in (DEGRADED, UNKNOWN) for r in required):
        return DEGRADED
    # Required repos all healthy (or there are none) — optional issues degrade.
    if any(r["rollup"] != HEALTHY for r in repos):
        return DEGRADED
    return HEALTHY


async def build_project_health(db, project_id: str):
    """Per-repo + per-bundle rollups for a project (GIN-416 operational view)."""
    from gigsnano_api.features.system.schemas import (
        BundleHealthOut,
        ProjectHealthOut,
        RepoHealthOut,
    )
    from gigsnano_api.features.system.service import (
        _active_bundles,
        _active_repos,
        _current_version,
    )

    repos = await _active_repos(db, project_id)
    rollup_by_id = {
        r.id: repo_health_rollup(r.clone_status.value, r.sync_status.value, r.index_status.value)
        for r in repos
    }
    repo_health = [
        RepoHealthOut(
            project_repository_id=r.id, display_name=r.display_name, rollup=rollup_by_id[r.id]
        )
        for r in repos
    ]

    bundle_health_out = []
    for bundle in await _active_bundles(db, project_id):
        version = await _current_version(db, bundle)
        cfg_repos = [
            {
                "rollup": rollup_by_id.get(c["project_repository_id"], UNKNOWN),
                "required": c.get("required"),
            }
            for c in (version.configuration_json or {}).get("repositories", [])
        ]
        bundle_health_out.append(
            BundleHealthOut(bundle_id=bundle.id, name=bundle.name, rollup=bundle_health(cfg_repos))
        )

    return ProjectHealthOut(repositories=repo_health, bundles=bundle_health_out)
