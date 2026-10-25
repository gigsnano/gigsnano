from datetime import date

from gigsnano_api.auth.models import User
from gigsnano_api.models import (
    Cycle,
    ECycleStatus,
    EStoryStatus,
    Project,
    ProjectMember,
    Story,
    Workspace,
)
from gigsnano_api.shared.serializers import (
    serialize_cycle,
    serialize_project,
    serialize_stories,
)


async def seed(db_session):
    user = User(email="ada@example.test", display_name="Ada Lovelace", password_hash="x")
    ws = Workspace(slug="acme", name="Acme")
    db_session.add_all([user, ws])
    await db_session.flush()
    project = Project(workspace_id=ws.id, name="Mobile App", identifier="MBA",
                      cover_image_url="https://img.test/c.jpg", lead_id=user.id,
                      start_date=date(2026, 7, 1), target_date=date(2026, 9, 1))
    db_session.add(project)
    await db_session.flush()
    db_session.add(ProjectMember(project_id=project.id, user_id=user.id))
    cycle = Cycle(project_id=project.id, name="Sprint 0", is_sprint_zero=True,
                  status=ECycleStatus.ACTIVE)
    db_session.add(cycle)
    await db_session.flush()
    return user, ws, project, cycle


async def test_serialize_project_shape(db_session):
    user, ws, project, _ = await seed(db_session)
    out = (await serialize_project(db_session, project, ws.slug)).model_dump(mode="json")
    assert out["workspace_slug"] == "acme"
    assert out["start_date"] == "2026-07-01"
    assert out["member_count"] == 1
    assert out["members"] == [
        {"id": user.id, "display_name": "Ada Lovelace", "avatar_url": None}
    ]
    assert out["sprint_zero_status"] == "not_started"
    assert out["sprint_zero_progress"] == 0
    assert set(out) == {
        "id", "workspace_slug", "name", "identifier", "cover_image_url", "logo_emoji",
        "logo_color", "logo_image_url", "start_date", "target_date", "description",
        "overview", "lead_id", "member_count", "members", "flow", "has_ui",
        "sprint_zero_status", "sprint_zero_progress", "repo_full_name",
        "repo_default_branch", "clone_status", "clone_error", "index_status",
        "index_error", "indexed_commit_sha", "indexed_at", "created_at", "updated_at",
        "planning_method", "planning_method_updated_at",  # GIN-330
    }


async def test_serialize_story_order_and_bmad(db_session):
    _, ws, project, cycle = await seed(db_session)
    parent = Story(project_id=project.id, cycle_id=cycle.id, title="Parent", sort_order=0)
    db_session.add(parent)
    await db_session.flush()
    child = Story(project_id=project.id, title="Child", sort_order=1, parent_id=parent.id)
    bmad = Story(project_id=project.id, cycle_id=cycle.id, title="Create the PRD",
                 sort_order=2, bmad_workflow="bmad-prd", bmad_agent="Product Manager · John",
                 bmad_artifact="prd.md", bmad_is_required=True)
    db_session.add_all([child, bmad])
    await db_session.flush()

    outs = [o.model_dump(mode="json") for o in
            await serialize_stories(db_session, [parent, child, bmad], ws.slug)]
    assert outs[0]["order"] == 0 and "sort_order" not in outs[0]
    assert outs[0]["sub_issue_count"] == 1
    assert outs[1]["bmad"] is None
    assert outs[2]["bmad"] == {
        "workflow": "bmad-prd", "agent": "Product Manager · John", "artifact": "prd.md",
        "is_locked": True, "is_required": True, "skipped": False, "readiness_result": None,
    }


async def test_serialize_cycle_counts(db_session):
    _, ws, project, cycle = await seed(db_session)
    db_session.add_all([
        Story(project_id=project.id, cycle_id=cycle.id, title="A", sort_order=0,
              status=EStoryStatus.DONE),
        Story(project_id=project.id, cycle_id=cycle.id, title="B", sort_order=1),
    ])
    await db_session.flush()
    out = (await serialize_cycle(db_session, cycle, ws.slug)).model_dump(mode="json")
    assert out["story_count"] == 2
    assert out["completed_story_count"] == 1
    assert out["is_sprint_zero"] is True
