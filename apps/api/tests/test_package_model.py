"""GIN-394: a package groups the artifacts uploaded together."""

from sqlalchemy import select

from gigsnano_api.models.artifacts import Artifact, EArtifactStatus
from gigsnano_api.models.packages import DocumentPackage


async def test_package_groups_its_documents(db_session, make_project):
    project = await make_project()
    package = DocumentPackage(project_id=project.id, name="OnServe delivery")
    db_session.add(package)
    await db_session.flush()

    db_session.add(
        Artifact(
            project_id=project.id,
            doc_type="other",
            title="Mobile phases 0-3",
            content_md="# Phase 0",
            status=EArtifactStatus.FINAL,
            package_id=package.id,
            original_path="docs/phases/2026-07-22-mobile-phases-0-3.md",
            parse_state="ok",
            checksum="abc123",
            byte_size=11,
        )
    )
    await db_session.flush()

    assert package.status == "uploaded"
    assert package.correlation_id
    stored = list(
        (
            await db_session.execute(
                select(Artifact).where(Artifact.package_id == package.id)
            )
        ).scalars()
    )
    assert len(stored) == 1
    assert stored[0].original_path.endswith("mobile-phases-0-3.md")
    assert stored[0].canonical is False
