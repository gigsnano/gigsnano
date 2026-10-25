"""BMAD-to-disk mirror (spec §6): finalize's disk-mirror helper writes the
project's materialized docs under its physical workspace root."""

from pathlib import Path

import pytest

from gigsnano_api.models import Artifact, EArtifactStatus
from gigsnano_api.workspace.artifacts import write_project_artifacts_to_disk


@pytest.fixture(autouse=True)
def _workspace_base(tmp_path, monkeypatch):
    from gigsnano_api.core.config import settings

    monkeypatch.setattr(settings, "workspace_base_path", str(tmp_path))
    return tmp_path


async def test_writes_final_artifact_to_disk(db_session, make_project, _workspace_base):
    project = await make_project()
    db_session.add(
        Artifact(
            project_id=project.id,
            doc_type="prd",
            version=1,
            title="PRD",
            content_md="# Product Requirements\n\nSome content.\n",
            status=EArtifactStatus.FINAL,
        )
    )
    await db_session.commit()

    await write_project_artifacts_to_disk(db_session, project)

    project_root = Path(_workspace_base) / project.id
    prd_path = project_root / "docs" / "prd.md"
    assert prd_path.exists()
    assert "Product Requirements" in prd_path.read_text(encoding="utf-8")


async def test_ignores_non_final_artifacts(db_session, make_project, _workspace_base):
    project = await make_project()
    db_session.add(
        Artifact(
            project_id=project.id,
            doc_type="prd",
            version=1,
            title="PRD Draft",
            content_md="# Draft\n",
            status=EArtifactStatus.DRAFT,
        )
    )
    await db_session.commit()

    await write_project_artifacts_to_disk(db_session, project)

    prd_path = Path(_workspace_base) / project.id / "docs" / "prd.md"
    assert not prd_path.exists()


async def test_never_raises_when_materialize_fails(db_session, make_project, monkeypatch):
    project = await make_project()

    async def _boom(*args, **kwargs):
        raise RuntimeError("materialize exploded")

    monkeypatch.setattr("gigsnano_api.sync.materializer.materialize", _boom)

    # Must not raise even though materialize() blows up.
    await write_project_artifacts_to_disk(db_session, project)
