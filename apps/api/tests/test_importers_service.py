import base64
from uuid import uuid4

from sqlalchemy import func, select

from gigsnano_api.auth.models import User
from gigsnano_api.features.importers.service import run_import
from gigsnano_api.models import (
    Cycle,
    EImportStatus,
    EMemberStatus,
    EWorkspaceRole,
    ImportedEntityRef,
    ImportJob,
    Project,
    ProjectLabel,
    Story,
    Workspace,
    WorkspaceMember,
)

CLEAN_CSV = (
    "project_identifier,project_name,identifier,name,state_name,priority,"
    "assignees,labels,cycles,parent,start_date\n"
    "WEB,Website,WEB-1,Fix login bug,Todo,high,Ada Lovelace,bug,Sprint 1,,2026-01-01\n"
    "WEB,Website,WEB-2,Add signup,In Progress,medium,,,,WEB-1,\n"
    "API,Backend API,API-1,Add auth endpoint,Done,urgent,,,,,\n"
)


async def _make_workspace_with_member(db_session, display_name: str = "Ada Lovelace") -> Workspace:
    ws = Workspace(slug=f"ws-{uuid4().hex[:8]}", name="Test Workspace")
    user = User(email=f"{uuid4().hex[:8]}@test.com", display_name=display_name, password_hash="x")
    db_session.add_all([ws, user])
    await db_session.flush()
    db_session.add(
        WorkspaceMember(
            workspace_id=ws.id, user_id=user.id,
            role=EWorkspaceRole.MEMBER, status=EMemberStatus.ACTIVE,
        )
    )
    await db_session.commit()
    await db_session.refresh(ws)
    return ws


async def _make_job(db_session, workspace_id: str, raw_text: str, fmt: str = "csv") -> ImportJob:
    job = ImportJob(
        workspace_id=workspace_id,
        source_format=fmt,
        status=EImportStatus.QUEUED,
        raw_content=base64.b64encode(raw_text.encode("utf-8")).decode("ascii"),
        summary={},
    )
    db_session.add(job)
    await db_session.commit()
    await db_session.refresh(job)
    return job


async def test_clean_import_creates_projects_stories_cycles_labels_states(db_session):
    ws = await _make_workspace_with_member(db_session)
    job = await _make_job(db_session, ws.id, CLEAN_CSV)

    await run_import(db_session, job.id)
    await db_session.refresh(job)

    assert job.status == EImportStatus.COMPLETED
    assert job.summary["projects_created"] == 2
    assert job.summary["stories_created"] == 3
    assert job.summary["cycles_created"] == 1
    assert job.summary["labels_created"] == 1
    assert job.summary["states_created"] == 3
    assert job.summary["errors"] == []

    project_count = (
        await db_session.execute(select(func.count(Project.id)).where(Project.workspace_id == ws.id))
    ).scalar_one()
    story_count = (
        await db_session.execute(
            select(func.count(Story.id)).join(Project).where(Project.workspace_id == ws.id)
        )
    ).scalar_one()
    assert project_count == 2
    assert story_count == 3

    web1 = (await db_session.execute(select(Story).where(Story.title == "Fix login bug"))).scalar_one()
    assert web1.assignee_id is not None
    web2 = (await db_session.execute(select(Story).where(Story.title == "Add signup"))).scalar_one()
    assert web2.parent_id == web1.id


async def test_rerun_is_idempotent_and_updates_instead_of_recreating(db_session):
    ws = await _make_workspace_with_member(db_session)
    job = await _make_job(db_session, ws.id, CLEAN_CSV)

    await run_import(db_session, job.id)
    await db_session.refresh(job)

    project_count_1 = (
        await db_session.execute(select(func.count(Project.id)).where(Project.workspace_id == ws.id))
    ).scalar_one()
    story_count_1 = (
        await db_session.execute(
            select(func.count(Story.id)).join(Project).where(Project.workspace_id == ws.id)
        )
    ).scalar_one()
    cycle_count_1 = (
        await db_session.execute(
            select(func.count(Cycle.id)).join(Project).where(Project.workspace_id == ws.id)
        )
    ).scalar_one()
    label_count_1 = (
        await db_session.execute(
            select(func.count(ProjectLabel.id)).join(Project).where(Project.workspace_id == ws.id)
        )
    ).scalar_one()

    await run_import(db_session, job.id)
    await db_session.refresh(job)

    assert job.summary["stories_created"] == 0
    assert job.summary["stories_updated"] == 3
    assert job.summary["projects_created"] == 0

    project_count_2 = (
        await db_session.execute(select(func.count(Project.id)).where(Project.workspace_id == ws.id))
    ).scalar_one()
    story_count_2 = (
        await db_session.execute(
            select(func.count(Story.id)).join(Project).where(Project.workspace_id == ws.id)
        )
    ).scalar_one()
    cycle_count_2 = (
        await db_session.execute(
            select(func.count(Cycle.id)).join(Project).where(Project.workspace_id == ws.id)
        )
    ).scalar_one()
    label_count_2 = (
        await db_session.execute(
            select(func.count(ProjectLabel.id)).join(Project).where(Project.workspace_id == ws.id)
        )
    ).scalar_one()

    assert project_count_2 == project_count_1
    assert story_count_2 == story_count_1
    assert cycle_count_2 == cycle_count_1
    assert label_count_2 == label_count_1

    ref_count = (
        await db_session.execute(
            select(func.count(ImportedEntityRef.id)).where(ImportedEntityRef.workspace_id == ws.id)
        )
    ).scalar_one()
    # projects(2) + states(3) + labels(1) + cycles(1) + stories(3) = 10, unchanged by the rerun.
    assert ref_count == 10


async def test_bad_date_on_one_row_is_recorded_but_others_still_succeed(db_session):
    ws = await _make_workspace_with_member(db_session)
    csv_text = (
        "project_identifier,project_name,identifier,name,state_name,priority,start_date\n"
        "WEB,Website,WEB-1,Fix login bug,Todo,high,not-a-date\n"
        "WEB,Website,WEB-2,Add signup,Todo,medium,2026-01-01\n"
    )
    job = await _make_job(db_session, ws.id, csv_text)

    await run_import(db_session, job.id)
    await db_session.refresh(job)

    assert job.status == EImportStatus.COMPLETED_WITH_ERRORS
    assert job.summary["stories_created"] == 1
    assert len(job.summary["errors"]) == 1
    assert job.summary["errors"][0]["row"] == "WEB-1"

    remaining = (await db_session.execute(select(Story).where(Story.title == "Add signup"))).scalar_one()
    assert remaining.start_date is not None


async def test_intermediate_statuses_are_committed_before_terminal(db_session):
    """GIN-21 review fix: a polling client must be able to observe PARSING/IMPORTING,
    not just QUEUED -> terminal. Spy on session.commit to capture the job's status
    at the moment each commit lands, proving those transitions are persisted
    mid-run (not only mutated in-memory and committed once at the end)."""
    ws = await _make_workspace_with_member(db_session)
    job = await _make_job(db_session, ws.id, CLEAN_CSV)

    committed_statuses = []
    orig_commit = db_session.commit

    async def spy_commit():
        await orig_commit()
        committed_statuses.append(job.status)

    db_session.commit = spy_commit
    try:
        await run_import(db_session, job.id)
    finally:
        db_session.commit = orig_commit

    # PARSING and IMPORTING must each have their own commit, both before the
    # final terminal-status commit.
    assert committed_statuses[0] == EImportStatus.PARSING
    assert committed_statuses[1] == EImportStatus.IMPORTING
    assert committed_statuses[-1] == EImportStatus.COMPLETED
    assert len(committed_statuses) == 3


async def test_unmatched_assignee_is_reported_not_an_error(db_session):
    ws = await _make_workspace_with_member(db_session, display_name="Ada Lovelace")
    csv_text = (
        "project_identifier,project_name,identifier,name,state_name,priority,assignees\n"
        "WEB,Website,WEB-1,Fix login bug,Todo,high,Nobody Here\n"
    )
    job = await _make_job(db_session, ws.id, csv_text)

    await run_import(db_session, job.id)
    await db_session.refresh(job)

    assert job.status == EImportStatus.COMPLETED
    assert job.summary["errors"] == []
    assert job.summary["unmatched_members"] == ["Nobody Here"]

    story = (await db_session.execute(select(Story).where(Story.title == "Fix login bug"))).scalar_one()
    assert story.assignee_id is None
