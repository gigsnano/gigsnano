"""GIN-398: where a work item came from, navigable both ways and durable."""

import pytest
from sqlalchemy import select

from gigsnano_api.features.package_import.analysis import analyse_package
from gigsnano_api.features.package_import.apply import (
    apply_plan,
    document_work_items,
    rollback_plan,
    work_item_sources,
)
from gigsnano_api.features.package_import.proposal import (
    AlreadyAppliedError,
    build_import_plan,
    plan_changes,
)
from gigsnano_api.features.package_import.service import (
    UploadFile,
    create_package,
    package_documents,
)
from gigsnano_api.bmad.provider import FakeProvider
from gigsnano_api.models.packages import WorkItemSource

_SPEC = "# Mobile spec\n\n## Phase 0\n\nFoundation work: set up CI.\n"


async def _applied(db_session, project):
    """Upload → analyse → propose → approve → apply, the whole spine."""
    package = await create_package(
        db_session, project=project, name="OnServe",
        files=[UploadFile(file_name="phases-0-3.md", mime_type="text/markdown",
                          content=_SPEC)],
    )
    # "phases-0-3.md" classifies at 0.95, so the model is never asked for a
    # type — the script is exactly one extract per section.
    provider = FakeProvider(extractions=[
        {"findings": []},  # "Mobile spec" preamble
        {"findings": [
            {"kind": "phase", "status": "approved", "title": "Phase 0", "confidence": 0.9},
            {"kind": "task", "status": "approved", "title": "Set up CI", "confidence": 0.9},
        ]},
    ])
    await analyse_package(db_session, provider, package)
    plan = await build_import_plan(
        db_session, package=package, project_id=project.id, strategy="convert"
    )
    for change in await plan_changes(db_session, plan.id):
        change.status = "approved"
    await db_session.flush()
    await apply_plan(db_session, project=project, plan=plan)
    return package, plan


async def test_work_item_cites_its_document_and_section(db_session, make_project):
    project = await make_project()
    package, plan = await _applied(db_session, project)

    story_change = next(
        c for c in await plan_changes(db_session, plan.id)
        if c.target == "story" and c.created_object_id
    )
    sources = await work_item_sources(db_session, story_change.created_object_id)
    assert len(sources) == 1
    assert sources[0].document_name == "phases-0-3.md"
    assert "Phase 0" in sources[0].anchor
    assert sources[0].anchor_start is not None  # points back into the text
    assert sources[0].document_version == 1


async def test_document_lists_everything_it_generated(db_session, make_project):
    project = await make_project()
    package, plan = await _applied(db_session, project)
    document = (await package_documents(db_session, package.id))[0]

    generated = await document_work_items(db_session, document.id)
    titles = {story.title for _, story in generated}
    assert {"Phase 0", "Set up CI"} <= titles


async def test_provenance_survives_a_plan_rebuild(db_session, make_project):
    """The plan is a draft that gets rebuilt; provenance is history. Rebuilding
    after an apply used to cascade the changes away and take the trace with it."""
    project = await make_project()
    package, plan = await _applied(db_session, project)

    with pytest.raises(AlreadyAppliedError):
        await build_import_plan(
            db_session, package=package, project_id=project.id, strategy="preserve"
        )

    # The links are still there, and still point at real work items.
    links = list((await db_session.execute(select(WorkItemSource))).scalars())
    assert links and all(link.document_name == "phases-0-3.md" for link in links)


async def test_rollback_removes_the_links_it_created(db_session, make_project):
    project = await make_project()
    package, plan = await _applied(db_session, project)
    assert (await db_session.execute(select(WorkItemSource))).scalars().all()

    await rollback_plan(db_session, plan=plan)
    assert (await db_session.execute(select(WorkItemSource))).scalars().all() == []
