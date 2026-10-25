import pytest
from sqlalchemy.exc import IntegrityError

from gigsnano_api.models import EImportStatus, ImportedEntityRef, ImportJob


async def test_import_job_round_trip(db_session, make_workspace):
    ws = await make_workspace()
    job = ImportJob(
        workspace_id=ws.id,
        source_format="csv",
        status=EImportStatus.QUEUED,
        raw_content="Y3N2LWNvbnRlbnQ=",
        summary={"stories_created": 0},
    )
    db_session.add(job)
    await db_session.commit()
    await db_session.refresh(job)

    fetched = await db_session.get(ImportJob, job.id)
    assert fetched is not None
    assert fetched.workspace_id == ws.id
    assert fetched.source_format == "csv"
    assert fetched.status == EImportStatus.QUEUED
    assert fetched.summary == {"stories_created": 0}
    assert fetched.created_by is None


async def test_imported_entity_ref_round_trip(db_session, make_workspace):
    ws = await make_workspace()
    ref = ImportedEntityRef(
        workspace_id=ws.id,
        entity_type="project",
        external_key="PROJ",
        gigsnano_id="some-project-id",
    )
    db_session.add(ref)
    await db_session.commit()
    await db_session.refresh(ref)

    fetched = await db_session.get(ImportedEntityRef, ref.id)
    assert fetched is not None
    assert fetched.entity_type == "project"
    assert fetched.external_key == "PROJ"
    assert fetched.gigsnano_id == "some-project-id"


async def test_imported_entity_ref_unique_constraint_rejects_duplicate(
    db_session, make_workspace
):
    ws = await make_workspace()
    db_session.add(
        ImportedEntityRef(
            workspace_id=ws.id, entity_type="story", external_key="PROJ-1",
            gigsnano_id="story-1",
        )
    )
    await db_session.commit()

    db_session.add(
        ImportedEntityRef(
            workspace_id=ws.id, entity_type="story", external_key="PROJ-1",
            gigsnano_id="story-2",
        )
    )
    with pytest.raises(IntegrityError):
        await db_session.commit()
