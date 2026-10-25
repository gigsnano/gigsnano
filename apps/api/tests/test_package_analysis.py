"""GIN-395: analysis turns a package into anchored findings, and nothing else."""

import pytest

from gigsnano_api.bmad.provider import FakeProvider
from gigsnano_api.features.package_import.analysis import (
    analyse_package,
    classify,
    package_findings,
)
from gigsnano_api.features.package_import.service import (
    UploadFile,
    create_package,
    package_documents,
)

_SPEC = (
    "# Mobile spec\n\n"
    "## Architecture\n\n"
    "The stack is React Native. This decision is approved by the client.\n\n"
    "## Phase 0\n\n"
    "Set up the repository and CI.\n"
)



async def _package(db_session, project, files=None):
    return await create_package(
        db_session,
        project=project,
        name="Northwind",
        files=files or [UploadFile(file_name="mobile-spec.md", mime_type="text/markdown",
                                   content=_SPEC)],
    )


async def test_findings_are_typed_and_anchored_to_their_section(db_session, make_project):
    project = await make_project()
    package = await _package(db_session, project)
    provider = FakeProvider(extractions=[
        {"doc_type": "implementation_plan", "confidence": 0.8},  # ambiguous -> model asked
        {"findings": []},
        {"findings": [{"kind": "decision", "status": "approved",
                       "title": "Stack is React Native", "confidence": 0.9}]},
        {"findings": [{"kind": "phase", "status": "proposed", "title": "Phase 0: repo + CI"}]},
        {"findings": []},
    ])
    findings = await analyse_package(db_session, provider, package)

    by_title = {f.title: f for f in findings}
    assert by_title["Stack is React Native"].kind == "decision"
    assert by_title["Stack is React Native"].status == "approved"
    # The anchor is the heading path, and the offsets point back into the document.
    assert "Architecture" in by_title["Stack is React Native"].anchor
    assert by_title["Stack is React Native"].anchor_start is not None
    assert by_title["Stack is React Native"].source_excerpt
    assert package.status == "analysed"


async def test_findings_outside_the_vocabulary_are_dropped(db_session, make_project):
    project = await make_project()
    package = await _package(db_session, project)
    provider = FakeProvider(extractions=[
        {"doc_type": "implementation_plan", "confidence": 0.8},
        {"findings": [
            {"kind": "wild_guess", "title": "Not a real kind"},
            {"kind": "risk", "status": "nonsense", "title": "Odoo fields unconfirmed"},
            {"kind": "risk", "title": "   "},
        ]},
        {"findings": []},
        {"findings": []},
    ])
    findings = await analyse_package(db_session, provider, package)
    assert [f.title for f in findings] == ["Odoo fields unconfirmed"]
    assert findings[0].status == "proposed"  # invalid status falls back, never stored raw


async def test_reanalysing_replaces_rather_than_duplicates(db_session, make_project):
    project = await make_project()
    package = await _package(db_session, project)
    script = lambda: FakeProvider(extractions=[  # noqa: E731 — a factory, not logic
        {"doc_type": "implementation_plan", "confidence": 0.8},
        {"findings": [{"kind": "module", "title": "Check-in"}]},
        {"findings": []},
        {"findings": []},
    ])
    await analyse_package(db_session, script(), package)
    await analyse_package(db_session, script(), package)
    assert len(await package_findings(db_session, package.id)) == 1


async def test_unreadable_documents_are_skipped_not_fatal(db_session, make_project):
    project = await make_project()
    package = await _package(
        db_session,
        project,
        files=[
            UploadFile(file_name="good.md", mime_type="text/markdown", content=_SPEC),
            UploadFile(file_name="blank.pdf", mime_type="application/pdf", content=""),
        ],
    )
    provider = FakeProvider(extractions=[
        {"doc_type": "implementation_plan", "confidence": 0.8},
        {"findings": [{"kind": "decision", "title": "Stack is React Native"}]},
        {"findings": []},
        {"findings": []},
    ])
    findings = await analyse_package(db_session, provider, package)
    assert [f.title for f in findings] == ["Stack is React Native"]


async def test_confident_classification_never_calls_the_model(db_session, make_project):
    project = await make_project()
    package = await _package(
        db_session,
        project,
        files=[UploadFile(file_name="design-system.md", mime_type="text/markdown",
                          content="# Design system\n\nTokens and components.")],
    )
    # An empty script means any extract call raises — proof the model was not asked.
    provider = FakeProvider(extractions=[])
    document = (await package_documents(db_session, package.id))[0]
    doc_type, confidence = await classify(provider, document)
    assert doc_type == "design_system"
    assert confidence >= 0.7


async def test_ambiguous_classification_escalates_to_the_model(db_session, make_project):
    project = await make_project()
    package = await _package(
        db_session,
        project,
        files=[UploadFile(file_name="notes.md", mime_type="text/markdown",
                          content="Met on Tuesday. Coffee was fine.")],
    )
    document = (await package_documents(db_session, package.id))[0]
    provider = FakeProvider(extractions=[{"doc_type": "product_requirements",
                                          "confidence": 0.8}])
    doc_type, confidence = await classify(provider, document)
    assert doc_type == "product_requirements"
    assert confidence >= 0.8


async def test_one_document_at_a_time_replaces_only_that_document(db_session, make_project):
    """The timeout fix: a package is analysed a document at a time, so each
    request stays bounded. Re-running one document must not disturb another's
    findings."""
    from gigsnano_api.features.package_import.analysis import analyse_single_document

    project = await make_project()
    package = await _package(
        db_session,
        project,
        files=[
            UploadFile(file_name="a-spec.md", mime_type="text/markdown", content=_SPEC),
            UploadFile(
                file_name="b-plan.md",
                mime_type="text/markdown",
                content="# Plan\n\n## Phase 9\n\nShip it.\n",
            ),
        ],
    )
    docs = {d.file_name: d for d in await package_documents(db_session, package.id)}

    await analyse_single_document(
        db_session,
        FakeProvider(extractions=[
            {"doc_type": "implementation_plan", "confidence": 0.8},
            {"findings": []},
            {"findings": [{"kind": "decision", "title": "From A"}]},
        ]),
        package,
        docs["a-spec.md"].id,
    )
    await analyse_single_document(
        db_session,
        FakeProvider(extractions=[
            {"doc_type": "implementation_plan", "confidence": 0.8},  # ambiguous name
            {"findings": []},
            {"findings": [{"kind": "phase", "title": "From B"}]},
        ]),
        package,
        docs["b-plan.md"].id,
    )
    assert sorted(f.title for f in await package_findings(db_session, package.id)) == [
        "From A",
        "From B",
    ]

    # Re-reading B replaces B's findings and leaves A's alone.
    await analyse_single_document(
        db_session,
        FakeProvider(extractions=[
            {"doc_type": "implementation_plan", "confidence": 0.8},
            {"findings": []},
            {"findings": [{"kind": "phase", "title": "From B, again"}]},
        ]),
        package,
        docs["b-plan.md"].id,
    )
    assert sorted(f.title for f in await package_findings(db_session, package.id)) == [
        "From A",
        "From B, again",
    ]


async def test_a_document_from_another_package_is_rejected(db_session, make_project):
    from gigsnano_api.features.package_import.analysis import analyse_single_document

    project = await make_project()
    mine = await _package(db_session, project)
    theirs = await _package(db_session, project)
    stranger = (await package_documents(db_session, theirs.id))[0]

    with pytest.raises(LookupError):
        await analyse_single_document(db_session, FakeProvider(extractions=[]), mine, stranger.id)
