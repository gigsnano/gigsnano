"""Restartable project solution metadata backfill + audit (GIN-445)."""

from gigsnano_api.features.solutions.audit import audit_solution_metadata
from gigsnano_api.features.solutions.backfill import backfill_project_solutions
from gigsnano_api.models import Project


async def test_backfill_fills_nulls_and_is_idempotent(db_session, make_project):
    p = await make_project()
    assert p.solution_key is None
    report = await backfill_project_solutions(db_session, batch_size=10)
    await db_session.refresh(p)
    assert p.solution_key == "software_delivery" and p.solution_version == 1
    assert report.updated >= 1
    report2 = await backfill_project_solutions(db_session, batch_size=10)
    assert report2.updated == 0


async def test_backfill_does_not_overwrite_valid_values(db_session, make_project):
    p = await make_project(solution_key="software_delivery", solution_version=2)
    await backfill_project_solutions(db_session)
    await db_session.refresh(p)
    assert p.solution_version == 2


async def test_backfill_reports_invalid_combinations(db_session, make_project):
    """Unknown keys and non-SD null versions are left alone and reported."""
    unknown = await make_project(solution_key="not_a_solution", solution_version=1)
    ra_null_ver = await make_project(
        solution_key="revenue_assurance", solution_version=None
    )
    report = await backfill_project_solutions(db_session, batch_size=10)
    await db_session.refresh(unknown)
    await db_session.refresh(ra_null_ver)
    assert unknown.solution_key == "not_a_solution"
    assert ra_null_ver.solution_version is None
    invalid_ids = {row.project_id for row in report.invalid}
    assert unknown.id in invalid_ids
    assert ra_null_ver.id in invalid_ids


async def test_audit_flags_null_metadata_then_clean_after_backfill(
    db_session, make_project
):
    p = await make_project()
    before = await audit_solution_metadata(db_session)
    assert before.ok is False
    ws = before.workspaces[p.workspace_id]
    assert ws.null_metadata >= 1
    assert ws.projects == 1

    await backfill_project_solutions(db_session, batch_size=10)

    after = await audit_solution_metadata(db_session, baseline=before)
    assert after.ok is True
    assert after.workspaces[p.workspace_id].null_metadata == 0
    assert after.invariant_mismatches == []


async def test_audit_flags_invalid_metadata(db_session, make_project):
    p = await make_project(solution_key="not_a_solution", solution_version=1)
    report = await audit_solution_metadata(db_session)
    assert report.ok is False
    assert report.workspaces[p.workspace_id].invalid_metadata >= 1
    assert report.workspaces[p.workspace_id].null_metadata == 0


async def test_audit_detects_invariant_mismatch(db_session, make_project):
    p = await make_project(
        solution_key="software_delivery", solution_version=1
    )
    before = await audit_solution_metadata(db_session)
    assert before.ok is True

    # Insert a second project in the same workspace — project count invariant breaks.
    extra = Project(
        workspace_id=p.workspace_id,
        name="Extra",
        identifier="EXT",
        cover_image_url="https://img.test/cover2.jpg",
        solution_key="software_delivery",
        solution_version=1,
    )
    db_session.add(extra)
    await db_session.commit()

    after = await audit_solution_metadata(db_session, baseline=before)
    assert after.ok is False
    assert p.workspace_id in after.invariant_mismatches
