from gigsnano_api.auth.models import User
from gigsnano_api.models import (
    EStateGroup,
    Project,
    ProjectAutomation,
    ProjectEstimate,
    ProjectFeature,
    ProjectLabel,
    ProjectState,
    Workspace,
)


async def _project(db_session):
    user = User(email="ada@example.test", display_name="Ada Lovelace", password_hash="x")
    ws = Workspace(slug="acme", name="Acme")
    db_session.add_all([user, ws])
    await db_session.flush()
    project = Project(workspace_id=ws.id, name="App", identifier="APP",
                      cover_image_url="https://img.test/c.jpg")
    db_session.add(project)
    await db_session.flush()
    return project


async def test_settings_rows_persist(db_session):
    project = await _project(db_session)
    label = ProjectLabel(project_id=project.id, name="Bug", color="#ef4444")
    state = ProjectState(project_id=project.id, name="Todo", color="#64748b",
                         group=EStateGroup.UNSTARTED, sort_order=1)
    est = ProjectEstimate(project_id=project.id, name="Points", type="points")
    feature = ProjectFeature(project_id=project.id, key="cycles", name="Cycles",
                             description="d", enabled=True)
    auto = ProjectAutomation(project_id=project.id, name="A", trigger="t", action="a")
    db_session.add_all([label, state, est, feature, auto])
    await db_session.commit()

    assert EStateGroup.UNSTARTED.value == "unstarted"
    assert state.group is EStateGroup.UNSTARTED and state.sort_order == 1
    assert label.color == "#ef4444"
    assert est.description == ""   # Text column defaults to empty string
    assert auto.enabled is True    # Boolean defaults to True
