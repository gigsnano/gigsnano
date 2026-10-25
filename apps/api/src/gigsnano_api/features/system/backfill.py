"""Migration backfill for GIN-409: legacy singular repo -> ProjectRepository + Default bundle.

Written against a *sync* SQLAlchemy Connection (an Alembic bind) using lightweight
``sa.table`` definitions, so it does not import the ORM models and stays valid
across future schema changes. The pure value-builders are unit-tested directly;
``backfill_connection`` is idempotent, so a rerun after a partial failure is safe.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime, timezone
from uuid import uuid4

import sqlalchemy as sa

from gigsnano_api.models.base import JSON_DOC

# --- Lightweight table handles (no ORM) -------------------------------------

_projects = sa.table(
    "projects",
    sa.column("id", sa.String),
    sa.column("repo_full_name", sa.String),
    sa.column("repo_default_branch", sa.String),
    sa.column("clone_status", sa.String),
    sa.column("index_status", sa.String),
    sa.column("indexed_commit_sha", sa.String),
    sa.column("indexed_at", sa.DateTime(timezone=True)),
)

_repos = sa.table(
    "project_repositories",
    sa.column("id", sa.String),
    sa.column("project_id", sa.String),
    sa.column("provider_connection_id", sa.String),
    sa.column("provider", sa.String),
    sa.column("external_repository_id", sa.String),
    sa.column("full_name", sa.String),
    sa.column("display_name", sa.String),
    sa.column("repository_type", sa.String),
    sa.column("default_branch", sa.String),
    sa.column("is_primary", sa.Boolean),
    sa.column("default_access", sa.String),
    sa.column("clone_status", sa.String),
    sa.column("clone_error", sa.String),
    sa.column("sync_status", sa.String),
    sa.column("sync_error", sa.String),
    sa.column("index_status", sa.String),
    sa.column("index_error", sa.String),
    sa.column("indexed_commit_sha", sa.String),
    sa.column("indexed_at", sa.DateTime(timezone=True)),
    sa.column("created_by", sa.String),
    sa.column("archived_at", sa.DateTime(timezone=True)),
    sa.column("created_at", sa.DateTime(timezone=True)),
    sa.column("updated_at", sa.DateTime(timezone=True)),
)

_bundles = sa.table(
    "system_bundles",
    sa.column("id", sa.String),
    sa.column("project_id", sa.String),
    sa.column("name", sa.String),
    sa.column("description", sa.String),
    sa.column("status", sa.String),
    sa.column("is_default", sa.Boolean),
    sa.column("current_version", sa.Integer),
    sa.column("created_by", sa.String),
    sa.column("created_at", sa.DateTime(timezone=True)),
    sa.column("updated_at", sa.DateTime(timezone=True)),
)

_versions = sa.table(
    "system_bundle_versions",
    sa.column("id", sa.String),
    sa.column("bundle_id", sa.String),
    sa.column("version", sa.Integer),
    sa.column("configuration_json", JSON_DOC),
    sa.column("validation_result_json", JSON_DOC),
    sa.column("created_by", sa.String),
    sa.column("created_at", sa.DateTime(timezone=True)),
    sa.column("updated_at", sa.DateTime(timezone=True)),
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


# --- Pure value builders (unit-tested) --------------------------------------


def primary_repository_values(project: Mapping, now: datetime) -> dict:
    """Map a legacy project row (with ``repo_full_name`` set) to a Primary repo row.

    ``external_repository_id`` uses the full name — the only stable identity the
    legacy row carries — so a rerun de-dupes on (project, provider, full_name).
    """
    full_name = str(project["repo_full_name"])
    display_name = full_name.rsplit("/", 1)[-1] or full_name
    return {
        "id": str(uuid4()),
        "project_id": project["id"],
        "provider_connection_id": None,
        "provider": "github",
        "external_repository_id": full_name,
        "full_name": full_name,
        "display_name": display_name,
        # Legacy single repo is the deliverable app — Application, Write, Required.
        "repository_type": "application",
        "default_branch": project.get("repo_default_branch") or "main",
        "is_primary": True,
        "default_access": "write",
        "clone_status": project.get("clone_status") or "none",
        "clone_error": None,
        "sync_status": "none",
        "sync_error": None,
        "index_status": project.get("index_status") or "none",
        "index_error": None,
        "indexed_commit_sha": project.get("indexed_commit_sha"),
        "indexed_at": project.get("indexed_at"),
        "created_by": None,
        "archived_at": None,
        "created_at": now,
        "updated_at": now,
    }


def default_bundle_values(project_id: str, repo: Mapping, now: datetime) -> tuple[dict, dict]:
    """Build the Default (Valid) bundle + its immutable v1 for a migrated project."""
    bundle_id = str(uuid4())
    repo_config = {
        "project_repository_id": repo["id"],
        "repository_type": repo["repository_type"],
        "branch": repo["default_branch"],
        "source_path": "",
        "mount_path": "",
        "access": repo["default_access"],
        "required": True,
        "build_command": "",
        "test_command": "",
        "execution_order": 0,
    }
    bundle = {
        "id": bundle_id,
        "project_id": project_id,
        "name": "Default",
        "description": "Default bundle containing the project's primary repository.",
        "status": "valid",
        "is_default": True,
        "current_version": 1,
        "created_by": None,
        "created_at": now,
        "updated_at": now,
    }
    version = {
        "id": str(uuid4()),
        "bundle_id": bundle_id,
        "version": 1,
        "configuration_json": {"repositories": [repo_config], "dependencies": []},
        "validation_result_json": {"valid": True, "issues": []},
        "created_by": None,
        "created_at": now,
        "updated_at": now,
    }
    return bundle, version


# --- Idempotent orchestration (used by the migration + tested) --------------


def backfill_connection(conn: sa.engine.Connection) -> int:
    """Create a Primary ProjectRepository + Default bundle for every project that
    has a legacy repo but none yet. Returns the number of projects migrated.

    Idempotent: skips a project that already has any project_repositories row and,
    separately, any system_bundles row — so a rerun after a partial failure only
    fills the gaps.
    """
    now = _now()
    rows = (
        conn.execute(
            sa.select(
                _projects.c.id,
                _projects.c.repo_full_name,
                _projects.c.repo_default_branch,
                _projects.c.clone_status,
                _projects.c.index_status,
                _projects.c.indexed_commit_sha,
                _projects.c.indexed_at,
            ).where(_projects.c.repo_full_name.isnot(None))
        )
        .mappings()
        .all()
    )

    migrated = 0
    for project in rows:
        project_id = project["id"]
        has_repo = conn.execute(
            sa.select(_repos.c.id).where(_repos.c.project_id == project_id).limit(1)
        ).first()
        if has_repo:
            repo_values = None
        else:
            repo_values = primary_repository_values(project, now)
            conn.execute(_repos.insert().values(**repo_values))
            migrated += 1

        has_bundle = conn.execute(
            sa.select(_bundles.c.id).where(_bundles.c.project_id == project_id).limit(1)
        ).first()
        if not has_bundle:
            # Resolve the repo row to point the bundle at (the one we just made,
            # or a pre-existing primary if the repo step was already done).
            if repo_values is None:
                repo_values = (
                    conn.execute(
                        sa.select(
                            _repos.c.id,
                            _repos.c.repository_type,
                            _repos.c.default_branch,
                            _repos.c.default_access,
                        )
                        .where(_repos.c.project_id == project_id)
                        .where(_repos.c.is_primary.is_(True))
                        .limit(1)
                    )
                    .mappings()
                    .first()
                )
            if repo_values is not None:
                bundle, version = default_bundle_values(project_id, repo_values, now)
                conn.execute(_bundles.insert().values(**bundle))
                conn.execute(_versions.insert().values(**version))

    return migrated


def rollback_connection(conn: sa.engine.Connection) -> None:
    """Data-only rollback: remove every seeded bundle/version/repository row,
    leaving the tables (and all legacy Project.repo_* columns) intact."""
    conn.execute(_versions.delete())
    conn.execute(_bundles.delete())
    conn.execute(_repos.delete())
