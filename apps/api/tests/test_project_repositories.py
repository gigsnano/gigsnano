"""GIN-409 — project_repositories domain, backfill, rollback, and resolver."""

import importlib.util
from datetime import datetime, timezone
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from gigsnano_api.features.system import resolver
from gigsnano_api.features.system.backfill import (
    backfill_connection,
    default_bundle_values,
    primary_repository_values,
    rollback_connection,
)
from gigsnano_api.models import (
    Base,
    Project,
    ProjectRepository,
    SystemBundle,
    SystemBundleVersion,
)
from gigsnano_api.models.projects import ECloneStatus, EIndexStatus
from gigsnano_api.models.system import ERepoAccess, ERepositoryType


def _now() -> datetime:
    return datetime(2026, 7, 24, tzinfo=timezone.utc)


def _repo(project_id: str, **over) -> ProjectRepository:
    base = dict(
        project_id=project_id,
        provider="github",
        external_repository_id="acme/web",
        full_name="acme/web",
        display_name="web",
    )
    base.update(over)
    return ProjectRepository(**base)


# --- Constraints (async ORM) ------------------------------------------------


async def test_unique_provider_identity(db_session, make_project):
    project = await make_project()
    db_session.add(_repo(project.id))
    await db_session.commit()
    db_session.add(_repo(project.id))  # same (project, provider, external_id)
    with pytest.raises(IntegrityError):
        await db_session.commit()


async def test_one_active_primary_per_project(db_session, make_project):
    project = await make_project()
    db_session.add(
        _repo(project.id, external_repository_id="a", full_name="acme/a", is_primary=True)
    )
    await db_session.commit()
    db_session.add(
        _repo(project.id, external_repository_id="b", full_name="acme/b", is_primary=True)
    )
    with pytest.raises(IntegrityError):
        await db_session.commit()


async def test_archived_primary_does_not_block_a_new_primary(db_session, make_project):
    project = await make_project()
    db_session.add(
        _repo(
            project.id,
            external_repository_id="a",
            full_name="acme/a",
            is_primary=True,
            archived_at=_now(),
        )
    )
    await db_session.commit()
    # A fresh active Primary is allowed because the old one is archived.
    db_session.add(
        _repo(project.id, external_repository_id="b", full_name="acme/b", is_primary=True)
    )
    await db_session.commit()
    assert (await resolver.get_primary_repository(db_session, project.id)).full_name == "acme/b"


async def test_project_can_hold_multiple_repositories(db_session, make_project):
    project = await make_project()
    db_session.add(
        _repo(project.id, external_repository_id="a", full_name="acme/a", is_primary=True)
    )
    db_session.add(_repo(project.id, external_repository_id="b", full_name="acme/b"))
    await db_session.commit()
    repos = await resolver.list_repositories(db_session, project.id)
    assert {r.full_name for r in repos} == {"acme/a", "acme/b"}


# --- Pure builders ----------------------------------------------------------


def test_primary_repository_values_maps_legacy_fields():
    row = primary_repository_values(
        {
            "id": "p1",
            "repo_full_name": "acme/web-app",
            "repo_default_branch": "develop",
            "clone_status": "ready",
            "index_status": "ready",
            "indexed_commit_sha": "abc123",
            "indexed_at": _now(),
        },
        _now(),
    )
    assert row["project_id"] == "p1"
    assert row["full_name"] == "acme/web-app"
    assert row["display_name"] == "web-app"
    assert row["external_repository_id"] == "acme/web-app"
    assert row["is_primary"] is True
    assert row["repository_type"] == "application"
    assert row["default_access"] == "write"
    assert row["default_branch"] == "develop"
    assert row["clone_status"] == "ready"
    assert row["index_status"] == "ready"
    assert row["indexed_commit_sha"] == "abc123"


def test_default_bundle_values_shape():
    repo = {
        "id": "r1",
        "repository_type": "application",
        "default_branch": "main",
        "default_access": "write",
    }
    bundle, version = default_bundle_values("p1", repo, _now())
    assert bundle["is_default"] is True
    assert bundle["status"] == "valid"
    assert bundle["current_version"] == 1
    assert version["bundle_id"] == bundle["id"]
    assert version["version"] == 1
    assert version["validation_result_json"] == {"valid": True, "issues": []}
    cfg = version["configuration_json"]
    assert cfg["dependencies"] == []
    assert cfg["repositories"][0]["project_repository_id"] == "r1"
    assert cfg["repositories"][0]["required"] is True


# --- Backfill / rollback (sync connection, like the Alembic bind) -----------


def _sync_engine_with_projects(projects: list[dict]):
    """A shared-cache in-memory sqlite engine with the schema created and the given
    Project rows inserted via the ORM (so Python-side defaults apply)."""
    engine = create_engine("sqlite://", poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as s:
        for i, p in enumerate(projects):
            s.add(
                Project(
                    workspace_id="ws1",
                    name=f"P{i}",
                    identifier=f"T{i}",
                    cover_image_url="x",
                    **p,
                )
            )
        s.commit()
    return engine


def test_backfill_creates_primary_and_default_bundle():
    engine = _sync_engine_with_projects(
        [
            {
                "id": "p1",
                "repo_full_name": "acme/web",
                "repo_default_branch": "main",
                "clone_status": ECloneStatus.READY,
                "index_status": EIndexStatus.READY,
                "indexed_commit_sha": "sha1",
            },
            {"id": "p2"},  # no repo → skipped
        ]
    )
    with engine.begin() as conn:
        migrated = backfill_connection(conn)
    assert migrated == 1

    with Session(engine) as s:
        repos = s.scalars(select(ProjectRepository)).all()
        assert len(repos) == 1
        repo = repos[0]
        assert repo.project_id == "p1"
        assert repo.is_primary is True
        assert repo.repository_type == ERepositoryType.APPLICATION
        assert repo.default_access == ERepoAccess.WRITE
        assert repo.index_status == EIndexStatus.READY
        assert repo.indexed_commit_sha == "sha1"

        bundles = s.scalars(select(SystemBundle)).all()
        assert len(bundles) == 1 and bundles[0].is_default and bundles[0].name == "Default"
        version = s.scalars(select(SystemBundleVersion)).one()
        assert version.configuration_json["repositories"][0]["project_repository_id"] == repo.id


def test_backfill_is_idempotent():
    engine = _sync_engine_with_projects([{"id": "p1", "repo_full_name": "acme/web"}])
    with engine.begin() as conn:
        assert backfill_connection(conn) == 1
    with engine.begin() as conn:
        assert backfill_connection(conn) == 0  # rerun does nothing
    with Session(engine) as s:
        assert len(s.scalars(select(ProjectRepository)).all()) == 1
        assert len(s.scalars(select(SystemBundle)).all()) == 1


def test_backfill_resumes_after_partial_failure():
    """Repo already created (bundle step never ran) → rerun fills only the bundle."""
    engine = _sync_engine_with_projects([{"id": "p1", "repo_full_name": "acme/web"}])
    with Session(engine) as s:
        s.add(_repo("p1", is_primary=True))
        s.commit()
    with engine.begin() as conn:
        migrated = backfill_connection(conn)
    assert migrated == 0  # repo not re-created
    with Session(engine) as s:
        assert len(s.scalars(select(ProjectRepository)).all()) == 1  # no duplicate
        bundle = s.scalars(select(SystemBundle)).one()  # bundle now filled
        version = s.scalars(select(SystemBundleVersion)).one()
        repo = s.scalars(select(ProjectRepository)).one()
        assert version.configuration_json["repositories"][0]["project_repository_id"] == repo.id
        assert bundle.is_default


def test_rollback_removes_seeded_rows_but_keeps_projects():
    engine = _sync_engine_with_projects([{"id": "p1", "repo_full_name": "acme/web"}])
    with engine.begin() as conn:
        backfill_connection(conn)
        rollback_connection(conn)
    with Session(engine) as s:
        assert s.scalars(select(ProjectRepository)).all() == []
        assert s.scalars(select(SystemBundle)).all() == []
        assert s.scalars(select(SystemBundleVersion)).all() == []
        assert s.scalars(select(Project)).one().repo_full_name == "acme/web"  # legacy intact


# --- Resolver ---------------------------------------------------------------


async def test_get_repository_by_id(db_session, make_project):
    project = await make_project()
    repo = _repo(project.id, is_primary=True)
    db_session.add(repo)
    await db_session.commit()
    assert (await resolver.get_repository(db_session, repo.id)).full_name == "acme/web"


async def test_list_repositories_excludes_archived(db_session, make_project):
    project = await make_project()
    db_session.add(
        _repo(project.id, external_repository_id="a", full_name="acme/a", is_primary=True)
    )
    db_session.add(
        _repo(project.id, external_repository_id="b", full_name="acme/b", archived_at=_now())
    )
    await db_session.commit()
    active = await resolver.list_repositories(db_session, project.id)
    assert [r.full_name for r in active] == ["acme/a"]
    allr = await resolver.list_repositories(db_session, project.id, include_archived=True)
    assert len(allr) == 2


# --- The actual migration DDL runs on sqlite (deploy de-risk) ---------------


def _load_migration():
    path = (
        Path(__file__).resolve().parents[1]
        / "migrations"
        / "versions"
        / "39d57a5a4e63_gin_409_project_repositories.py"
    )
    spec = importlib.util.spec_from_file_location("gin409_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _run(engine, fn_name):
    """Run the migration's upgrade/downgrade with a real Alembic Operations bound
    to a sqlite connection (the module-level ``op`` is swapped for our instance)."""
    mig = _load_migration()
    with engine.begin() as conn:
        mig.op = Operations(MigrationContext.configure(conn))
        getattr(mig, fn_name)()


def test_migration_upgrade_creates_schema_and_backfills_then_downgrades():
    engine = create_engine("sqlite://", poolclass=StaticPool)
    # Only the FK target needs to pre-exist (as at this point in the real chain).
    from gigsnano_api.models import Project as _P

    _P.__table__.create(engine)
    with Session(engine) as s:
        s.add(
            _P(
                id="p1",
                workspace_id="ws1",
                name="P",
                identifier="TST",
                cover_image_url="x",
                repo_full_name="acme/web",
                repo_default_branch="main",
            )
        )
        s.commit()

    _run(engine, "upgrade")

    insp = inspect(engine)
    tables = set(insp.get_table_names())
    assert {"project_repositories", "system_bundles", "system_bundle_versions"} <= tables
    # Migration-built columns match the ORM model (no drift → app queries won't break).
    migrated_cols = {c["name"] for c in insp.get_columns("project_repositories")}
    model_cols = {c.name for c in ProjectRepository.__table__.columns}
    assert model_cols <= migrated_cols
    with Session(engine) as s:
        repo = s.scalars(select(ProjectRepository)).one()
        assert repo.is_primary and repo.full_name == "acme/web"
        assert s.scalars(select(SystemBundle)).one().is_default

    _run(engine, "downgrade")
    tables_after = set(inspect(engine).get_table_names())
    assert not ({"project_repositories", "system_bundles", "system_bundle_versions"} & tables_after)
    assert "projects" in tables_after  # legacy table + its columns untouched
