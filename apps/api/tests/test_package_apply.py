"""GIN-397: applying a plan creates real work — once, survivably, undoably."""

from sqlalchemy import select

from gigsnano_api.features.package_import.apply import apply_plan, rollback_plan
from gigsnano_api.features.package_import.proposal import build_import_plan, plan_changes
from gigsnano_api.features.package_import.service import UploadFile, create_package
from gigsnano_api.models.cycles import Cycle
from gigsnano_api.models.modules import Module
from gigsnano_api.models.packages import PackageFinding
from gigsnano_api.models.stories import Story


async def _package(db_session, project):
    return await create_package(
        db_session, project=project, name="Northwind",
        files=[UploadFile(file_name="spec.md", mime_type="text/markdown", content="# Spec")],
    )


#: Findings written in one flush share a created_at, so document position is
#: what orders them — `anchor_start` mirrors where each section really sat.
def _finding(package_id, kind, title, *, status="approved", confidence=0.9,
             anchor="Spec", offset=0):
    return PackageFinding(
        package_id=package_id, document_id=None, kind=kind, status=status,
        title=title, detail="", confidence=confidence, anchor=anchor,
        anchor_start=offset, anchor_end=offset + 100,
    )


async def _planned(db_session, project, findings, strategy="convert"):
    package = await _package(db_session, project)
    for finding in findings:
        finding.package_id = package.id
        db_session.add(finding)
    await db_session.flush()
    plan = await build_import_plan(
        db_session, package=package, project_id=project.id, strategy=strategy
    )
    for change in await plan_changes(db_session, plan.id):
        change.status = "approved"
    await db_session.flush()
    return package, plan


async def _stories(db_session, project):
    return list(
        (await db_session.execute(select(Story).where(Story.project_id == project.id))).scalars()
    )


async def test_apply_creates_the_approved_structure(db_session, make_project):
    project = await make_project()
    package, plan = await _planned(db_session, project, [
        _finding(None, "module", "Check-in", offset=0),
        _finding(None, "phase", "Phase 0", anchor="Spec > Phase 0", offset=100),
        _finding(None, "task", "Set up CI", anchor="Spec > Phase 0", offset=200),
    ])
    result = await apply_plan(db_session, project=project, plan=plan)

    assert result["failed"] == 0
    assert result["status"] == "applied"
    modules = (await db_session.execute(
        select(Module).where(Module.project_id == project.id))).scalars().all()
    cycles = (await db_session.execute(
        select(Cycle).where(Cycle.project_id == project.id))).scalars().all()
    assert [m.name for m in modules] == ["Check-in"]
    assert "Phase 0" in [c.name for c in cycles]

    stories = {s.title: s for s in await _stories(db_session, project)}
    assert stories["Set up CI"].parent_id == stories["Phase 0"].id  # child under its epic
    assert stories["Phase 0"].type.value == "epic"


async def test_every_created_item_gets_its_own_number(db_session, make_project):
    project = await make_project()
    package, plan = await _planned(db_session, project, [
        _finding(None, "phase", "Phase 0", anchor="Spec > Phase 0", offset=100),
        _finding(None, "task", "Task one", anchor="Spec > Phase 0", offset=200),
        _finding(None, "task", "Task two", anchor="Spec > Phase 0", offset=300),
    ])
    await apply_plan(db_session, project=project, plan=plan)
    numbers = [s.story_number for s in await _stories(db_session, project)]
    assert len(numbers) == len(set(numbers))  # the counters trap: no duplicates
    assert all(n is not None for n in numbers)


async def test_reapplying_creates_nothing_twice(db_session, make_project):
    project = await make_project()
    package, plan = await _planned(db_session, project, [
        _finding(None, "phase", "Phase 0", anchor="Spec > Phase 0", offset=100),
        _finding(None, "task", "Set up CI", anchor="Spec > Phase 0", offset=200),
    ])
    first = await apply_plan(db_session, project=project, plan=plan)
    before = len(await _stories(db_session, project))

    second = await apply_plan(db_session, project=project, plan=plan)
    assert second["applied"] == 0
    assert second["skipped"] == first["applied"]
    assert len(await _stories(db_session, project)) == before


async def test_one_failure_does_not_sink_the_rest(db_session, make_project):
    project = await make_project()
    # A dependency cannot be linked yet — it must fail alone, not stop the plan.
    package, plan = await _planned(db_session, project, [
        _finding(None, "phase", "Phase 0", anchor="Spec > Phase 0", offset=100),
        _finding(None, "dependency", "Login before check-in", offset=150),
        _finding(None, "task", "Set up CI", anchor="Spec > Phase 0", offset=200),
    ])
    result = await apply_plan(db_session, project=project, plan=plan)

    assert result["status"] == "partially_applied"
    assert result["failed"] == 1
    assert result["applied"] >= 3
    failed = [c for c in await plan_changes(db_session, plan.id) if c.status == "failed"]
    assert "work items chosen" in failed[0].error  # says what a human must do
    assert {s.title for s in await _stories(db_session, project)} >= {"Phase 0", "Set up CI"}


async def test_rollback_removes_exactly_what_the_run_created(db_session, make_project):
    project = await make_project()
    # A pre-existing item must survive the rollback untouched.
    existing = Story(project_id=project.id, title="Already here", story_number=1)
    db_session.add(existing)
    await db_session.flush()

    package, plan = await _planned(db_session, project, [
        _finding(None, "phase", "Phase 0", anchor="Spec > Phase 0", offset=100),
        _finding(None, "task", "Set up CI", anchor="Spec > Phase 0", offset=200),
    ])
    await apply_plan(db_session, project=project, plan=plan)
    assert len(await _stories(db_session, project)) > 1

    result = await rollback_plan(db_session, plan=plan)
    assert result["status"] == "rolled_back"
    remaining = await _stories(db_session, project)
    assert [s.title for s in remaining] == ["Already here"]
    assert (await db_session.execute(
        select(Cycle).where(Cycle.project_id == project.id))).scalars().all() == []


async def test_rollback_leaves_unapplied_changes_alone(db_session, make_project):
    project = await make_project()
    package, plan = await _planned(db_session, project, [
        _finding(None, "phase", "Phase 0", anchor="Spec > Phase 0", offset=100),
        _finding(None, "dependency", "Login before check-in", offset=200),
    ])
    await apply_plan(db_session, project=project, plan=plan)
    await rollback_plan(db_session, plan=plan)

    statuses = {c.target: c.status for c in await plan_changes(db_session, plan.id)}
    assert statuses["cycle"] == "rolled_back"
    assert statuses["relation"] == "failed"  # never applied, so never rolled back
