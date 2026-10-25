"""GIN-399: an agent can drive a whole document import over MCP."""

import pytest

from gigsnano_api.bmad.provider import FakeProvider
from gigsnano_api.mcp_server import tools
from gigsnano_api.mcp_server.auth import set_bearer

_SPEC = "# Mobile spec\n\n## Phase 0\n\nFoundation work: set up CI.\n"


def _file(name: str, content: str) -> dict:
    return {"file_name": name, "mime_type": "text/markdown", "content": content}


def _script(app, findings: list[dict]) -> None:
    """"phases-0-3.md" classifies at 0.95, so the model is asked once per section
    and never for the document type."""
    app.state.llm_provider = FakeProvider(extractions=[
        {"findings": []},        # preamble
        {"findings": findings},  # "Phase 0"
    ])


@pytest.mark.asyncio
async def test_agent_drives_upload_through_apply(app, pat_for_user, seed_project):
    set_bearer(pat_for_user.token)
    project = f"{pat_for_user.workspace_slug}/{seed_project.id}"

    package = await tools.upload_project_package(
        project=project, name="OnServe", files=[_file("phases-0-3.md", _SPEC)]
    )
    assert package["counts"]["ready"] == 1

    _script(app, [
        {"kind": "phase", "status": "approved", "title": "Phase 0", "confidence": 0.9},
        {"kind": "task", "status": "approved", "title": "Set up CI", "confidence": 0.9},
    ])
    analysis = await tools.analyse_project_documents(project=project, package_id=package["id"])
    assert analysis["counts_by_kind"] == {"phase": 1, "task": 1}

    plan = await tools.propose_project_structure_from_documents(
        project=project, package_id=package["id"], strategy="convert"
    )
    assert plan["can_apply"] is False  # nothing approved yet
    decided = await tools.decide_project_import_changes(
        project=project, package_id=package["id"], decision="approved"
    )
    assert decided["can_apply"] is True

    applied = await tools.apply_project_import(project=project, package_id=package["id"])
    assert applied["status"] == "applied" and applied["failed"] == 0

    status = await tools.get_project_intake_status(project=project, package_id=package["id"])
    assert status["plan"]["status"] == "applied"
    assert status["gaps"] == 0


@pytest.mark.asyncio
async def test_gaps_are_listed_and_resolvable(app, pat_for_user, seed_project):
    set_bearer(pat_for_user.token)
    project = f"{pat_for_user.workspace_slug}/{seed_project.id}"
    package = await tools.upload_project_package(
        project=project, files=[_file("phases-0-3.md", _SPEC)]
    )
    _script(app, [
        {"kind": "decision", "status": "conflict", "title": "Two stacks named"},
        {"kind": "task", "status": "assumption", "title": "Guessed task"},
    ])
    await tools.analyse_project_documents(project=project, package_id=package["id"])

    gaps = await tools.list_project_intake_gaps(project=project, package_id=package["id"])
    assert gaps["total"] == 2 and gaps["blocking"] == 1

    conflict = next(g for g in gaps["gaps"] if g["status"] == "conflict")
    resolved = await tools.resolve_project_intake_gap(
        project=project, package_id=package["id"], finding_id=conflict["id"], status="approved"
    )
    assert resolved["override"] == {"status": "approved"}  # decision beside the original

    after = await tools.list_project_intake_gaps(project=project, package_id=package["id"])
    assert after["blocking"] == 0


@pytest.mark.asyncio
async def test_traceability_reads_both_directions(app, pat_for_user, seed_project):
    set_bearer(pat_for_user.token)
    project = f"{pat_for_user.workspace_slug}/{seed_project.id}"
    package = await tools.upload_project_package(
        project=project, files=[_file("phases-0-3.md", _SPEC)]
    )
    _script(app, [{"kind": "task", "status": "approved", "title": "Set up CI",
                   "confidence": 0.9}])
    await tools.analyse_project_documents(project=project, package_id=package["id"])
    await tools.propose_project_structure_from_documents(
        project=project, package_id=package["id"]
    )
    await tools.decide_project_import_changes(
        project=project, package_id=package["id"], decision="approved"
    )
    await tools.apply_project_import(project=project, package_id=package["id"])

    document_id = package["documents"][0]["id"]
    generated = await tools.get_document_traceability(
        project=project, package_id=package["id"], document_id=document_id
    )
    assert [g["title"] for g in generated] == ["Set up CI"]

    # And back the other way, by work-item code.
    code = f"{seed_project.identifier}-{generated[0]['story_number']}"
    sources = await tools.get_document_traceability(project=project, code=code)
    assert sources[0]["document_name"] == "phases-0-3.md"
    assert "Phase 0" in sources[0]["anchor"]


@pytest.mark.asyncio
async def test_rollback_undoes_the_import(app, pat_for_user, seed_project):
    set_bearer(pat_for_user.token)
    project = f"{pat_for_user.workspace_slug}/{seed_project.id}"
    package = await tools.upload_project_package(
        project=project, files=[_file("phases-0-3.md", _SPEC)]
    )
    _script(app, [{"kind": "task", "status": "approved", "title": "Set up CI",
                   "confidence": 0.9}])
    await tools.analyse_project_documents(project=project, package_id=package["id"])
    await tools.propose_project_structure_from_documents(
        project=project, package_id=package["id"]
    )
    await tools.decide_project_import_changes(
        project=project, package_id=package["id"], decision="approved"
    )
    await tools.apply_project_import(project=project, package_id=package["id"])

    rolled = await tools.rollback_project_import(project=project, package_id=package["id"])
    assert rolled["status"] == "rolled_back" and rolled["removed"] >= 1
